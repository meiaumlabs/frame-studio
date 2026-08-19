<?php
/**
 * Endpoints AJAX do Frame Studio.
 *
 * Público:
 *   - frs_save_image   : recebe a imagem final composta (data URL) e grava na
 *                        biblioteca de mídia, devolvendo a URL pública.
 * Admin (manage_options):
 *   - frs_add_mask     : cadastra uma moldura a partir de um anexo.
 *   - frs_remove_mask  : remove uma moldura.
 *
 * @package FrameStudio
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class FRS_Ajax {

	const PUBLIC_NONCE = 'frs_public';
	const ADMIN_NONCE  = 'frs_admin';

	public static function init() {
		add_action( 'wp_ajax_frs_save_image', array( __CLASS__, 'save_image' ) );
		add_action( 'wp_ajax_nopriv_frs_save_image', array( __CLASS__, 'save_image' ) );

		add_action( 'wp_ajax_frs_add_mask', array( __CLASS__, 'add_mask' ) );
		add_action( 'wp_ajax_frs_remove_mask', array( __CLASS__, 'remove_mask' ) );
	}

	/* ------------------------------------------------------------------ *
	 * Público: salvar imagem final.
	 * ------------------------------------------------------------------ */

	public static function save_image() {
		check_ajax_referer( self::PUBLIC_NONCE, 'nonce' );

		// Controle de quem pode gerar.
		if ( 'logged' === FRS_Settings::get( 'who_can' ) && ! is_user_logged_in() ) {
			wp_send_json_error( array( 'message' => __( 'Você precisa estar logado para gerar a imagem.', 'frame-studio' ) ), 403 );
		}

		// Rate limit simples por IP (evita abuso de armazenamento).
		if ( ! self::check_rate_limit() ) {
			wp_send_json_error( array( 'message' => __( 'Muitas gerações em pouco tempo. Aguarde alguns minutos e tente novamente.', 'frame-studio' ) ), 429 );
		}

		$data_url = isset( $_POST['image'] ) ? (string) wp_unslash( $_POST['image'] ) : '';
		if ( '' === $data_url ) {
			wp_send_json_error( array( 'message' => __( 'Nenhuma imagem recebida.', 'frame-studio' ) ), 400 );
		}

		$decoded = self::decode_data_url( $data_url );
		if ( is_wp_error( $decoded ) ) {
			wp_send_json_error( array( 'message' => $decoded->get_error_message() ), 400 );
		}

		$bytes = $decoded['bytes'];
		$ext   = $decoded['ext'];

		// Limite de tamanho.
		$max = (int) FRS_Settings::get( 'max_upload_mb' ) * 1024 * 1024;
		if ( strlen( $bytes ) > $max ) {
			wp_send_json_error( array( 'message' => __( 'A imagem gerada é grande demais.', 'frame-studio' ) ), 400 );
		}

		// Valida que é realmente uma imagem.
		$size = @getimagesizefromstring( $bytes );
		if ( false === $size || empty( $size[0] ) ) {
			wp_send_json_error( array( 'message' => __( 'Arquivo de imagem inválido.', 'frame-studio' ) ), 400 );
		}

		// Grava o arquivo em uploads.
		$filename = 'frame-studio-' . gmdate( 'Ymd-His' ) . '-' . wp_generate_password( 6, false, false ) . '.' . $ext;
		$upload   = wp_upload_bits( $filename, null, $bytes );

		if ( ! empty( $upload['error'] ) ) {
			wp_send_json_error( array( 'message' => $upload['error'] ), 500 );
		}

		// Cria o anexo na biblioteca de mídia.
		$attachment = array(
			'post_mime_type' => 'png' === $ext ? 'image/png' : 'image/jpeg',
			'post_title'     => __( 'Frame Studio', 'frame-studio' ) . ' — ' . gmdate( 'Y-m-d H:i:s' ),
			'post_content'   => '',
			'post_status'    => 'inherit',
		);

		require_once ABSPATH . 'wp-admin/includes/image.php';
		$attach_id = wp_insert_attachment( $attachment, $upload['file'] );
		if ( is_wp_error( $attach_id ) || ! $attach_id ) {
			wp_send_json_error( array( 'message' => __( 'Falha ao salvar na biblioteca de mídia.', 'frame-studio' ) ), 500 );
		}

		$meta = wp_generate_attachment_metadata( $attach_id, $upload['file'] );
		wp_update_attachment_metadata( $attach_id, $meta );

		// Marca a origem para permitir limpeza/identificação futura.
		update_post_meta( $attach_id, '_frs_generated', 1 );

		wp_send_json_success(
			array(
				'url'      => $upload['url'],
				'id'       => $attach_id,
				'filename' => $filename,
			)
		);
	}

	/* ------------------------------------------------------------------ *
	 * Admin: molduras.
	 * ------------------------------------------------------------------ */

	public static function add_mask() {
		check_ajax_referer( self::ADMIN_NONCE, 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Sem permissão.', 'frame-studio' ) ), 403 );
		}

		$attachment_id = isset( $_POST['attachment_id'] ) ? (int) $_POST['attachment_id'] : 0;
		$title         = isset( $_POST['title'] ) ? sanitize_text_field( wp_unslash( $_POST['title'] ) ) : '';

		$result = FRS_Masks::add( $attachment_id, $title );
		if ( is_wp_error( $result ) ) {
			wp_send_json_error( array( 'message' => $result->get_error_message() ), 400 );
		}

		wp_send_json_success( array( 'mask' => $result ) );
	}

	public static function remove_mask() {
		check_ajax_referer( self::ADMIN_NONCE, 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Sem permissão.', 'frame-studio' ) ), 403 );
		}

		$mask_id = isset( $_POST['mask_id'] ) ? sanitize_text_field( wp_unslash( $_POST['mask_id'] ) ) : '';
		$ok      = FRS_Masks::remove( $mask_id );

		if ( ! $ok ) {
			wp_send_json_error( array( 'message' => __( 'Moldura não encontrada.', 'frame-studio' ) ), 404 );
		}
		wp_send_json_success();
	}

	/* ------------------------------------------------------------------ *
	 * Helpers.
	 * ------------------------------------------------------------------ */

	/**
	 * Decodifica uma data URL (image/jpeg|png) em bytes brutos.
	 *
	 * @param string $data_url data:image/...;base64,....
	 * @return array|WP_Error array( bytes, ext, mime ) ou erro.
	 */
	private static function decode_data_url( $data_url ) {
		if ( ! preg_match( '#^data:image/(png|jpeg|jpg);base64,#i', $data_url, $m ) ) {
			return new WP_Error( 'frs_bad_dataurl', __( 'Formato de imagem não suportado.', 'frame-studio' ) );
		}

		$mime_sub = strtolower( $m[1] );
		$ext      = ( 'png' === $mime_sub ) ? 'png' : 'jpg';

		$base64 = substr( $data_url, strpos( $data_url, ',' ) + 1 );
		$base64 = str_replace( ' ', '+', $base64 );
		$bytes  = base64_decode( $base64, true );

		if ( false === $bytes || '' === $bytes ) {
			return new WP_Error( 'frs_decode_fail', __( 'Não foi possível decodificar a imagem.', 'frame-studio' ) );
		}

		return array(
			'bytes' => $bytes,
			'ext'   => $ext,
			'mime'  => 'png' === $ext ? 'image/png' : 'image/jpeg',
		);
	}

	/**
	 * Rate limit por IP: no máximo N gerações por janela.
	 *
	 * @return bool true se permitido.
	 */
	private static function check_rate_limit() {
		$limit  = (int) apply_filters( 'frs_rate_limit_max', 20 );   // gerações
		$window = (int) apply_filters( 'frs_rate_limit_window', 600 ); // segundos

		if ( $limit <= 0 ) {
			return true;
		}

		$ip  = self::client_ip();
		$key = 'frs_rl_' . md5( $ip );

		$count = (int) get_transient( $key );
		if ( $count >= $limit ) {
			return false;
		}
		set_transient( $key, $count + 1, $window );
		return true;
	}

	/**
	 * IP do cliente (best-effort, respeitando proxies comuns).
	 *
	 * @return string
	 */
	private static function client_ip() {
		$candidates = array( 'HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR' );
		foreach ( $candidates as $key ) {
			if ( ! empty( $_SERVER[ $key ] ) ) {
				$raw = sanitize_text_field( wp_unslash( $_SERVER[ $key ] ) );
				$raw = trim( explode( ',', $raw )[0] );
				$ip  = filter_var( $raw, FILTER_VALIDATE_IP );
				if ( $ip ) {
					return $ip;
				}
			}
		}
		return '0.0.0.0';
	}
}

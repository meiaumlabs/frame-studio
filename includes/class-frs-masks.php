<?php
/**
 * Gerência das molduras (frames PNG).
 *
 * Cada moldura referencia um anexo da biblioteca de mídia (PNG com centro
 * transparente). A lista é mantida como opção; aqui ficam as operações de
 * adicionar, remover, reordenar e montar a lista pública para o frontend.
 *
 * @package FrameStudio
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class FRS_Masks {

	/**
	 * Adiciona uma moldura a partir de um anexo já na biblioteca de mídia.
	 *
	 * @param int    $attachment_id ID do anexo.
	 * @param string $title         Título opcional (usa o do anexo se vazio).
	 * @return array|WP_Error Item da moldura ou erro.
	 */
	public static function add( $attachment_id, $title = '' ) {
		$attachment_id = (int) $attachment_id;

		if ( $attachment_id <= 0 || 'attachment' !== get_post_type( $attachment_id ) ) {
			return new WP_Error( 'frs_invalid_attachment', __( 'Anexo inválido.', 'frame-studio' ) );
		}

		$mime = get_post_mime_type( $attachment_id );
		if ( 'image/png' !== $mime ) {
			return new WP_Error( 'frs_not_png', __( 'A moldura precisa ser um arquivo PNG (com transparência).', 'frame-studio' ) );
		}

		$url = wp_get_attachment_url( $attachment_id );
		if ( ! $url ) {
			return new WP_Error( 'frs_no_url', __( 'Não foi possível obter a URL do anexo.', 'frame-studio' ) );
		}

		$meta = wp_get_attachment_metadata( $attachment_id );
		$w    = isset( $meta['width'] ) ? (int) $meta['width'] : 0;
		$h    = isset( $meta['height'] ) ? (int) $meta['height'] : 0;

		if ( '' === trim( (string) $title ) ) {
			$title = get_the_title( $attachment_id );
		}

		$item = array(
			'id'            => 'm_' . $attachment_id . '_' . wp_generate_password( 6, false, false ),
			'title'         => sanitize_text_field( $title ),
			'attachment_id' => $attachment_id,
			'url'           => esc_url_raw( $url ),
			'w'             => $w,
			'h'             => $h,
		);

		$masks   = FRS_Settings::masks();
		$masks[] = $item;
		FRS_Settings::save_masks( $masks );

		return $item;
	}

	/**
	 * Remove uma moldura pela sua id interna.
	 *
	 * @param string $mask_id ID interna da moldura.
	 * @return bool
	 */
	public static function remove( $mask_id ) {
		$mask_id = sanitize_text_field( $mask_id );
		$masks   = FRS_Settings::masks();
		$before  = count( $masks );

		$masks = array_filter(
			$masks,
			function ( $m ) use ( $mask_id ) {
				return isset( $m['id'] ) && $m['id'] !== $mask_id;
			}
		);

		FRS_Settings::save_masks( array_values( $masks ) );
		return count( $masks ) !== $before;
	}

	/**
	 * Busca uma moldura pela id interna.
	 *
	 * @param string $mask_id ID interna.
	 * @return array|null
	 */
	public static function find( $mask_id ) {
		foreach ( FRS_Settings::masks() as $m ) {
			if ( isset( $m['id'] ) && $m['id'] === $mask_id ) {
				return $m;
			}
		}
		return null;
	}

	/**
	 * Lista pública para o frontend, revalidando as URLs dos anexos.
	 *
	 * @return array
	 */
	public static function public_list() {
		$out = array();
		foreach ( FRS_Settings::masks() as $m ) {
			$url = wp_get_attachment_url( (int) $m['attachment_id'] );
			if ( ! $url ) {
				continue; // Anexo removido: pula.
			}
			$thumb = wp_get_attachment_image_url( (int) $m['attachment_id'], 'medium' );
			$out[] = array(
				'id'    => $m['id'],
				'title' => $m['title'],
				'url'   => $url,
				'thumb' => $thumb ? $thumb : $url,
				'w'     => isset( $m['w'] ) ? (int) $m['w'] : 0,
				'h'     => isset( $m['h'] ) ? (int) $m['h'] : 0,
			);
		}
		return $out;
	}
}

<?php
/**
 * Configurações do Frame Studio.
 *
 * Guarda todas as opções numa única entrada de option (frs_settings) mais a
 * lista de molduras (frs_masks). Fornece getters com valores padrão.
 *
 * @package FrameStudio
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class FRS_Settings {

	const OPTION      = 'frs_settings';
	const OPTION_MASKS = 'frs_masks';
	const OPTION_VER   = 'frs_settings_ver';

	/**
	 * Defaults das configurações gerais.
	 *
	 * @return array
	 */
	public static function defaults() {
		return array(
			'accent_color'  => '#2563eb', // Cor principal (botões/realces).
			'accent2_color' => '#1c2430', // Cor do botão "Compartilhar" (secundária).
			'bg_color'      => '#ffffff', // Fundo da composição (áreas fora da foto).
			'canvas_w'      => 1080,
			'canvas_h'      => 1920,
			'output_format' => 'png',     // png | jpeg — PNG (sem perda) é o padrão
			'jpeg_quality'  => 92,        // 1..100 (só para jpeg)
			'who_can'       => 'all',     // all | logged
			'max_upload_mb' => 40,        // limite do arquivo (PNG de alta resolução é maior)
			'headline'      => '',        // texto opcional no topo da página do shortcode
			'help_text'     => '',        // instrução opcional para o usuário
			'event_name'    => 'Imersão Medconectt', // nome do evento/projeto p/ slug + SEO
			'ask_name'      => 1,         // pedir o nome da pessoa antes de gerar (1|0)
			'show_credit'   => 1,         // exibir a assinatura "Feito com Frame Studio" (1|0)
		);
	}

	/**
	 * Grava os defaults na ativação, sem sobrescrever o que já existe.
	 */
	public static function install_defaults() {
		if ( false === get_option( self::OPTION, false ) ) {
			add_option( self::OPTION, self::defaults() );
		}
		if ( false === get_option( self::OPTION_MASKS, false ) ) {
			add_option( self::OPTION_MASKS, array() );
		}
	}

	/**
	 * Migração idempotente das opções salvas de instalações antigas.
	 * Roda no plugins_loaded; usa uma flag de versão para executar uma vez.
	 */
	public static function maybe_upgrade() {
		$ver = get_option( self::OPTION_VER, '0' );
		if ( version_compare( $ver, '1.7.0', '>=' ) ) {
			return;
		}

		$saved = get_option( self::OPTION, array() );
		if ( is_array( $saved ) ) {
			// Saída em PNG de alta resolução (pedido do cliente): o default
			// histórico era 'jpeg'. Quem tiver escolhido explicitamente pode
			// voltar para JPG no painel a qualquer momento.
			if ( empty( $saved['output_format'] ) || 'jpeg' === $saved['output_format'] ) {
				$saved['output_format'] = 'png';
			}
			// PNG de alta resolução é maior: garante folga no limite de upload.
			if ( empty( $saved['max_upload_mb'] ) || (int) $saved['max_upload_mb'] < 40 ) {
				$saved['max_upload_mb'] = 40;
			}
			update_option( self::OPTION, $saved );
		}

		update_option( self::OPTION_VER, '1.7.0' );
	}

	/**
	 * Retorna todas as configurações mescladas com os defaults.
	 *
	 * @return array
	 */
	public static function all() {
		$saved = get_option( self::OPTION, array() );
		if ( ! is_array( $saved ) ) {
			$saved = array();
		}
		return wp_parse_args( $saved, self::defaults() );
	}

	/**
	 * Retorna uma configuração específica.
	 *
	 * @param string $key     Chave.
	 * @param mixed  $default Valor padrão adicional.
	 * @return mixed
	 */
	public static function get( $key, $default = null ) {
		$all = self::all();
		if ( array_key_exists( $key, $all ) ) {
			return $all[ $key ];
		}
		return $default;
	}

	/**
	 * Salva as configurações já sanitizadas.
	 *
	 * @param array $input Dados crus do formulário.
	 * @return array Configuração salva.
	 */
	public static function save( array $input ) {
		$d     = self::defaults();
		$clean = array();

		$clean['accent_color']  = self::sanitize_color( $input['accent_color'] ?? '', $d['accent_color'] );
		$clean['accent2_color'] = self::sanitize_color( $input['accent2_color'] ?? '', $d['accent2_color'] );
		$clean['bg_color']      = self::sanitize_color( $input['bg_color'] ?? '', $d['bg_color'] );

		$clean['canvas_w'] = self::clamp_int( $input['canvas_w'] ?? $d['canvas_w'], 200, 6000, $d['canvas_w'] );
		$clean['canvas_h'] = self::clamp_int( $input['canvas_h'] ?? $d['canvas_h'], 200, 6000, $d['canvas_h'] );

		$fmt                    = strtolower( (string) ( $input['output_format'] ?? $d['output_format'] ) );
		$clean['output_format'] = in_array( $fmt, array( 'jpeg', 'png' ), true ) ? $fmt : $d['output_format'];

		$clean['jpeg_quality']  = self::clamp_int( $input['jpeg_quality'] ?? $d['jpeg_quality'], 40, 100, $d['jpeg_quality'] );

		$who              = (string) ( $input['who_can'] ?? $d['who_can'] );
		$clean['who_can'] = in_array( $who, array( 'all', 'logged' ), true ) ? $who : $d['who_can'];

		$clean['max_upload_mb'] = self::clamp_int( $input['max_upload_mb'] ?? $d['max_upload_mb'], 1, 50, $d['max_upload_mb'] );

		$clean['headline']  = sanitize_text_field( $input['headline'] ?? '' );
		$clean['help_text'] = sanitize_textarea_field( $input['help_text'] ?? '' );

		$clean['event_name'] = sanitize_text_field( $input['event_name'] ?? $d['event_name'] );
		if ( '' === trim( $clean['event_name'] ) ) {
			$clean['event_name'] = $d['event_name'];
		}
		$clean['ask_name']    = empty( $input['ask_name'] ) ? 0 : 1;
		$clean['show_credit'] = empty( $input['show_credit'] ) ? 0 : 1;

		update_option( self::OPTION, $clean );
		return $clean;
	}

	/**
	 * Lista de molduras cadastradas.
	 *
	 * Cada item: array( id, title, attachment_id, url, w, h ).
	 *
	 * @return array
	 */
	public static function masks() {
		$masks = get_option( self::OPTION_MASKS, array() );
		return is_array( $masks ) ? array_values( $masks ) : array();
	}

	/**
	 * Persiste a lista de molduras.
	 *
	 * @param array $masks Lista sanitizada.
	 */
	public static function save_masks( array $masks ) {
		update_option( self::OPTION_MASKS, array_values( $masks ) );
	}

	/* ------------------------------------------------------------------ *
	 * Helpers de sanitização.
	 * ------------------------------------------------------------------ */

	public static function sanitize_color( $value, $fallback ) {
		$value = sanitize_hex_color( (string) $value );
		return $value ? $value : $fallback;
	}

	public static function clamp_int( $value, $min, $max, $fallback ) {
		if ( ! is_numeric( $value ) ) {
			return $fallback;
		}
		$value = (int) $value;
		if ( $value < $min ) {
			return $min;
		}
		if ( $value > $max ) {
			return $max;
		}
		return $value;
	}
}

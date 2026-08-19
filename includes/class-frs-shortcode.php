<?php
/**
 * Shortcode [frame_studio] — interface pública de geração da imagem.
 *
 * Fluxo: escolher moldura → enviar foto → ajustar (arrastar/zoom) na prévia
 * 1080x1920 → confirmar → gerar → baixar/compartilhar.
 *
 * @package FrameStudio
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class FRS_Shortcode {

	const HANDLE = 'frs-app';

	public static function init() {
		add_shortcode( 'frame_studio', array( __CLASS__, 'render' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'maybe_enqueue' ) );
	}

	/**
	 * Enfileira assets apenas em páginas que usam o shortcode.
	 */
	public static function maybe_enqueue() {
		if ( ! is_singular() ) {
			return;
		}
		$post = get_post();
		if ( ! $post || ! has_shortcode( (string) $post->post_content, 'frame_studio' ) ) {
			return;
		}
		self::enqueue();
	}

	/**
	 * Registra e enfileira CSS/JS + dados localizados.
	 */
	public static function enqueue() {
		if ( wp_script_is( self::HANDLE, 'enqueued' ) ) {
			return;
		}

		wp_enqueue_style(
			self::HANDLE,
			FRS_URL . 'public/css/app.css',
			array(),
			FRS_VERSION
		);

		wp_enqueue_script(
			self::HANDLE,
			FRS_URL . 'public/js/app.js',
			array(),
			FRS_VERSION,
			true
		);

		$s = FRS_Settings::all();

		wp_localize_script(
			self::HANDLE,
			'FRS_DATA',
			array(
				'ajaxUrl'   => admin_url( 'admin-ajax.php' ),
				'nonce'     => wp_create_nonce( FRS_Ajax::PUBLIC_NONCE ),
				'masks'     => FRS_Masks::public_list(),
				'canvasW'   => (int) $s['canvas_w'],
				'canvasH'   => (int) $s['canvas_h'],
				'bgColor'   => $s['bg_color'],
				'format'    => $s['output_format'],
				'quality'   => (int) $s['jpeg_quality'],
				'maxMb'     => (int) $s['max_upload_mb'],
				'shareText' => apply_filters( 'frs_default_share_text', get_bloginfo( 'name' ) ),
				'i18n'      => self::i18n(),
			)
		);

		// Cor de destaque como CSS var.
		$accent = esc_attr( $s['accent_color'] );
		wp_add_inline_style( self::HANDLE, ".frs-app{--frs-accent:{$accent};}" );
	}

	/**
	 * Strings traduzíveis usadas no JS.
	 *
	 * @return array
	 */
	private static function i18n() {
		return array(
			'chooseMask'   => __( 'Escolha uma moldura', 'frame-studio' ),
			'sendPhoto'    => __( 'Enviar foto', 'frame-studio' ),
			'dropHere'     => __( 'Toque para enviar ou arraste sua foto aqui', 'frame-studio' ),
			'adjust'       => __( 'Arraste para posicionar • use o zoom para ajustar', 'frame-studio' ),
			'zoom'         => __( 'Zoom', 'frame-studio' ),
			'confirm'      => __( 'Confirmar e gerar', 'frame-studio' ),
			'generating'   => __( 'Gerando imagem…', 'frame-studio' ),
			'reset'        => __( 'Recomeçar', 'frame-studio' ),
			'download'     => __( 'Baixar imagem', 'frame-studio' ),
			'share'        => __( 'Compartilhar', 'frame-studio' ),
			'shareWhats'   => __( 'WhatsApp', 'frame-studio' ),
			'shareFace'    => __( 'Facebook', 'frame-studio' ),
			'shareInsta'   => __( 'Instagram', 'frame-studio' ),
			'newImage'     => __( 'Gerar outra', 'frame-studio' ),
			'done'         => __( 'Pronto! Sua imagem foi gerada.', 'frame-studio' ),
			'errNoMask'    => __( 'Selecione uma moldura primeiro.', 'frame-studio' ),
			'errNoPhoto'   => __( 'Envie uma foto primeiro.', 'frame-studio' ),
			'errBig'       => __( 'A foto excede o tamanho máximo permitido.', 'frame-studio' ),
			'errType'      => __( 'Envie um arquivo de imagem (JPG ou PNG).', 'frame-studio' ),
			'errGeneric'   => __( 'Algo deu errado. Tente novamente.', 'frame-studio' ),
			'instaHint'    => __( 'O Instagram não permite envio direto pelo navegador. Baixe a imagem e publique pelo app.', 'frame-studio' ),
			'copyLink'     => __( 'Copiar link', 'frame-studio' ),
			'linkCopied'   => __( 'Link copiado!', 'frame-studio' ),
		);
	}

	/**
	 * Renderiza o container do app.
	 *
	 * @param array $atts Atributos do shortcode.
	 * @return string
	 */
	public static function render( $atts = array() ) {
		self::enqueue();

		$s        = FRS_Settings::all();
		$headline = trim( (string) $s['headline'] );
		$help     = trim( (string) $s['help_text'] );
		$masks    = FRS_Masks::public_list();

		ob_start();
		?>
		<div class="frs-app" data-frs>
			<?php if ( '' !== $headline ) : ?>
				<h2 class="frs-headline"><?php echo esc_html( $headline ); ?></h2>
			<?php endif; ?>
			<?php if ( '' !== $help ) : ?>
				<p class="frs-help"><?php echo esc_html( $help ); ?></p>
			<?php endif; ?>

			<?php if ( empty( $masks ) ) : ?>
				<div class="frs-empty">
					<?php esc_html_e( 'Nenhuma moldura foi configurada ainda.', 'frame-studio' ); ?>
					<?php if ( current_user_can( 'manage_options' ) ) : ?>
						<a href="<?php echo esc_url( admin_url( 'admin.php?page=frame-studio' ) ); ?>">
							<?php esc_html_e( 'Cadastre uma moldura no painel.', 'frame-studio' ); ?>
						</a>
					<?php endif; ?>
				</div>
			<?php else : ?>
				<div class="frs-stage" data-frs-stage>
					<div class="frs-loading" data-frs-loading hidden>
						<span class="frs-spinner"></span>
						<span class="frs-loading-text"></span>
					</div>
					<!-- A interface é montada pelo JS dentro deste container. -->
				</div>
			<?php endif; ?>
			<div class="frs-credit">
				<?php esc_html_e( 'Feito com', 'frame-studio' ); ?>
				<a href="https://61labs.com.br" target="_blank" rel="noopener">Frame Studio</a>
			</div>
		</div>
		<?php
		return (string) ob_get_clean();
	}
}

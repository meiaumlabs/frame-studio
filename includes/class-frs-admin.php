<?php
/**
 * Painel administrativo do Frame Studio.
 *
 * Página única com: configurações gerais + gerenciador de molduras + ajuda de
 * uso do shortcode.
 *
 * @package FrameStudio
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class FRS_Admin {

	const PAGE   = 'frame-studio';
	const HANDLE = 'frs-admin';

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'maybe_save_settings' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( FRS_FILE ), array( __CLASS__, 'action_links' ) );
	}

	public static function menu() {
		add_menu_page(
			__( 'Frame Studio', 'frame-studio' ),
			__( 'Frame Studio', 'frame-studio' ),
			'manage_options',
			self::PAGE,
			array( __CLASS__, 'render_page' ),
			'dashicons-format-image',
			58
		);
	}

	public static function action_links( $links ) {
		$url  = admin_url( 'admin.php?page=' . self::PAGE );
		$link = '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Configurações', 'frame-studio' ) . '</a>';
		array_unshift( $links, $link );
		return $links;
	}

	public static function enqueue( $hook ) {
		if ( 'toplevel_page_' . self::PAGE !== $hook ) {
			return;
		}

		wp_enqueue_media();
		wp_enqueue_style( 'wp-color-picker' );

		wp_enqueue_style(
			self::HANDLE,
			FRS_URL . 'admin/css/admin.css',
			array( 'wp-color-picker' ),
			FRS_VERSION
		);

		wp_enqueue_script(
			self::HANDLE,
			FRS_URL . 'admin/js/admin.js',
			array( 'jquery', 'wp-color-picker' ),
			FRS_VERSION,
			true
		);

		$s = FRS_Settings::all();

		wp_localize_script(
			self::HANDLE,
			'FRS_ADMIN',
			array(
				'ajaxUrl' => admin_url( 'admin-ajax.php' ),
				'nonce'   => wp_create_nonce( FRS_Ajax::ADMIN_NONCE ),
				'canvasW' => (int) $s['canvas_w'],
				'canvasH' => (int) $s['canvas_h'],
				'i18n'    => array(
					'pickTitle'  => __( 'Escolher moldura PNG', 'frame-studio' ),
					'pickButton' => __( 'Usar esta moldura', 'frame-studio' ),
					'onlyPng'    => __( 'A moldura precisa ser um PNG com fundo transparente.', 'frame-studio' ),
					'confirmDel' => __( 'Remover esta moldura?', 'frame-studio' ),
					'sizeWarn'   => __( 'Atenção: a proporção da moldura difere do tamanho da tela configurado (%s). O ideal é que a moldura tenha exatamente essa dimensão.', 'frame-studio' ),
					'adding'     => __( 'Adicionando…', 'frame-studio' ),
					'genericErr' => __( 'Erro ao processar. Tente novamente.', 'frame-studio' ),
				),
			)
		);
	}

	/**
	 * Salva as configurações gerais quando o formulário é enviado.
	 */
	public static function maybe_save_settings() {
		if ( empty( $_POST['frs_settings_submit'] ) ) {
			return;
		}
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		check_admin_referer( 'frs_save_settings', 'frs_settings_nonce' );

		$input = isset( $_POST['frs'] ) && is_array( $_POST['frs'] ) ? wp_unslash( $_POST['frs'] ) : array();
		FRS_Settings::save( $input );

		add_settings_error( 'frs', 'frs_saved', __( 'Configurações salvas.', 'frame-studio' ), 'updated' );
		set_transient( 'frs_settings_notice', 1, 30 );

		wp_safe_redirect( admin_url( 'admin.php?page=' . self::PAGE . '&updated=1' ) );
		exit;
	}

	public static function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$s     = FRS_Settings::all();
		$masks = FRS_Masks::public_list();
		?>
		<div class="wrap frs-wrap">
			<h1><span class="dashicons dashicons-format-image"></span> <?php esc_html_e( 'Frame Studio', 'frame-studio' ); ?></h1>
			<p class="frs-sub"><?php esc_html_e( 'Gerador de imagens com moldura para redes sociais.', 'frame-studio' ); ?></p>

			<?php if ( isset( $_GET['updated'] ) && get_transient( 'frs_settings_notice' ) ) : ?>
				<?php delete_transient( 'frs_settings_notice' ); ?>
				<div class="notice notice-success is-dismissible"><p><?php esc_html_e( 'Configurações salvas.', 'frame-studio' ); ?></p></div>
			<?php endif; ?>

			<div class="frs-grid">

				<!-- Coluna: molduras -->
				<div class="frs-card">
					<h2><?php esc_html_e( 'Molduras', 'frame-studio' ); ?></h2>
					<p class="description">
						<?php
						printf(
							/* translators: %s: dimensões da tela */
							esc_html__( 'Envie artes PNG com o centro transparente. O ideal é que cada moldura tenha exatamente %s px.', 'frame-studio' ),
							'<strong>' . (int) $s['canvas_w'] . '×' . (int) $s['canvas_h'] . '</strong>'
						);
						?>
					</p>

					<div class="frs-masks" data-frs-masks>
						<?php if ( empty( $masks ) ) : ?>
							<p class="frs-masks-empty" data-frs-empty><?php esc_html_e( 'Nenhuma moldura cadastrada ainda.', 'frame-studio' ); ?></p>
						<?php endif; ?>
						<?php foreach ( $masks as $m ) : ?>
							<div class="frs-mask-item" data-mask-id="<?php echo esc_attr( $m['id'] ); ?>">
								<div class="frs-mask-thumb"><img src="<?php echo esc_url( $m['thumb'] ); ?>" alt="" loading="lazy"></div>
								<div class="frs-mask-meta">
									<span class="frs-mask-title"><?php echo esc_html( $m['title'] ? $m['title'] : __( '(sem título)', 'frame-studio' ) ); ?></span>
									<span class="frs-mask-dim"><?php echo (int) $m['w']; ?>×<?php echo (int) $m['h']; ?></span>
								</div>
								<button type="button" class="button-link frs-mask-del" data-frs-del><?php esc_html_e( 'Remover', 'frame-studio' ); ?></button>
							</div>
						<?php endforeach; ?>
					</div>

					<p>
						<button type="button" class="button button-primary" data-frs-add>
							<span class="dashicons dashicons-plus-alt2"></span>
							<?php esc_html_e( 'Adicionar moldura PNG', 'frame-studio' ); ?>
						</button>
					</p>
				</div>

				<!-- Coluna: configurações -->
				<div class="frs-card">
					<h2><?php esc_html_e( 'Configurações', 'frame-studio' ); ?></h2>
					<form method="post" action="">
						<?php wp_nonce_field( 'frs_save_settings', 'frs_settings_nonce' ); ?>

						<table class="form-table" role="presentation">
							<tr>
								<th scope="row"><?php esc_html_e( 'Tamanho da tela (px)', 'frame-studio' ); ?></th>
								<td>
									<input type="number" name="frs[canvas_w]" value="<?php echo esc_attr( $s['canvas_w'] ); ?>" min="200" max="6000" class="small-text"> ×
									<input type="number" name="frs[canvas_h]" value="<?php echo esc_attr( $s['canvas_h'] ); ?>" min="200" max="6000" class="small-text">
									<p class="description"><?php esc_html_e( 'Padrão de story: 1080 × 1920.', 'frame-studio' ); ?></p>
								</td>
							</tr>
							<tr>
								<th scope="row"><?php esc_html_e( 'Cor principal (botões)', 'frame-studio' ); ?></th>
								<td>
									<input type="text" name="frs[accent_color]" value="<?php echo esc_attr( $s['accent_color'] ); ?>" class="frs-color" data-default="#2563eb">
									<p class="description"><?php esc_html_e( 'Usada em “Baixar imagem”, seleção de moldura e destaques.', 'frame-studio' ); ?></p>
								</td>
							</tr>
							<tr>
								<th scope="row"><?php esc_html_e( 'Cor do botão “Compartilhar”', 'frame-studio' ); ?></th>
								<td><input type="text" name="frs[accent2_color]" value="<?php echo esc_attr( $s['accent2_color'] ); ?>" class="frs-color" data-default="#1c2430"></td>
							</tr>
							<tr>
								<th scope="row"><?php esc_html_e( 'Cor de fundo da composição', 'frame-studio' ); ?></th>
								<td>
									<input type="text" name="frs[bg_color]" value="<?php echo esc_attr( $s['bg_color'] ); ?>" class="frs-color" data-default="#ffffff">
									<p class="description"><?php esc_html_e( 'Preenche áreas fora da foto (se a foto não cobrir tudo).', 'frame-studio' ); ?></p>
								</td>
							</tr>
							<tr>
								<th scope="row"><?php esc_html_e( 'Formato de saída', 'frame-studio' ); ?></th>
								<td>
									<label><input type="radio" name="frs[output_format]" value="jpeg" <?php checked( $s['output_format'], 'jpeg' ); ?>> JPG</label>
									&nbsp;&nbsp;
									<label><input type="radio" name="frs[output_format]" value="png" <?php checked( $s['output_format'], 'png' ); ?>> PNG</label>
									<p class="description"><?php esc_html_e( 'JPG gera arquivos menores; PNG preserva transparência.', 'frame-studio' ); ?></p>
								</td>
							</tr>
							<tr>
								<th scope="row"><?php esc_html_e( 'Qualidade JPG', 'frame-studio' ); ?></th>
								<td><input type="number" name="frs[jpeg_quality]" value="<?php echo esc_attr( $s['jpeg_quality'] ); ?>" min="40" max="100" class="small-text"> %</td>
							</tr>
							<tr>
								<th scope="row"><?php esc_html_e( 'Quem pode gerar', 'frame-studio' ); ?></th>
								<td>
									<select name="frs[who_can]">
										<option value="all" <?php selected( $s['who_can'], 'all' ); ?>><?php esc_html_e( 'Qualquer visitante', 'frame-studio' ); ?></option>
										<option value="logged" <?php selected( $s['who_can'], 'logged' ); ?>><?php esc_html_e( 'Apenas usuários logados', 'frame-studio' ); ?></option>
									</select>
								</td>
							</tr>
							<tr>
								<th scope="row"><?php esc_html_e( 'Tamanho máximo do upload (MB)', 'frame-studio' ); ?></th>
								<td><input type="number" name="frs[max_upload_mb]" value="<?php echo esc_attr( $s['max_upload_mb'] ); ?>" min="1" max="50" class="small-text"></td>
							</tr>
							<tr>
								<th scope="row"><?php esc_html_e( 'Título da página (opcional)', 'frame-studio' ); ?></th>
								<td><input type="text" name="frs[headline]" value="<?php echo esc_attr( $s['headline'] ); ?>" class="regular-text"></td>
							</tr>
							<tr>
								<th scope="row"><?php esc_html_e( 'Instrução ao usuário (opcional)', 'frame-studio' ); ?></th>
								<td><textarea name="frs[help_text]" rows="2" class="large-text"><?php echo esc_textarea( $s['help_text'] ); ?></textarea></td>
							</tr>
							<tr>
								<th scope="row"><?php esc_html_e( 'Nome do evento/projeto', 'frame-studio' ); ?></th>
								<td>
									<input type="text" name="frs[event_name]" value="<?php echo esc_attr( $s['event_name'] ); ?>" class="regular-text">
									<p class="description"><?php esc_html_e( 'Usado no nome do arquivo e no SEO da imagem (título, alt, legenda). Ex.: Imersão Medconectt.', 'frame-studio' ); ?></p>
								</td>
							</tr>
							<tr>
								<th scope="row"><?php esc_html_e( 'Pedir o nome da pessoa', 'frame-studio' ); ?></th>
								<td>
									<label><input type="checkbox" name="frs[ask_name]" value="1" <?php checked( ! empty( $s['ask_name'] ) ); ?>> <?php esc_html_e( 'Perguntar o nome antes de gerar (usa para nomear/arquivar a imagem).', 'frame-studio' ); ?></label>
								</td>
							</tr>
							<tr>
								<th scope="row"><?php esc_html_e( 'Assinatura na página', 'frame-studio' ); ?></th>
								<td>
									<label><input type="checkbox" name="frs[show_credit]" value="1" <?php checked( ! empty( $s['show_credit'] ) ); ?>> <?php esc_html_e( 'Exibir “Feito com Frame Studio” na página do usuário.', 'frame-studio' ); ?></label>
								</td>
							</tr>
						</table>

						<p class="submit">
							<button type="submit" name="frs_settings_submit" value="1" class="button button-primary"><?php esc_html_e( 'Salvar configurações', 'frame-studio' ); ?></button>
						</p>
					</form>
				</div>
			</div>

			<?php
			$generated = get_posts(
				array(
					'post_type'      => 'attachment',
					'post_status'    => 'inherit',
					'posts_per_page' => 24,
					'orderby'        => 'date',
					'order'          => 'DESC',
					'meta_key'       => '_frs_generated', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
					'meta_value'     => '1',              // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
				)
			);
			?>
			<div class="frs-card frs-gallery">
				<h2><?php esc_html_e( 'Imagens geradas', 'frame-studio' ); ?></h2>
				<?php if ( empty( $generated ) ) : ?>
					<p class="description"><?php esc_html_e( 'Nenhuma imagem foi gerada pelos usuários ainda. As gerações aparecerão aqui.', 'frame-studio' ); ?></p>
				<?php else : ?>
					<p class="description"><?php esc_html_e( 'Últimas imagens geradas pelos visitantes (também ficam na Biblioteca de Mídia).', 'frame-studio' ); ?></p>
					<div class="frs-gallery-grid">
						<?php foreach ( $generated as $g ) : ?>
							<?php
							$g_thumb = wp_get_attachment_image_url( $g->ID, 'medium' );
							$g_full  = wp_get_attachment_url( $g->ID );
							$g_edit  = get_edit_post_link( $g->ID );
							$person  = get_post_meta( $g->ID, '_frs_person', true );
							?>
							<figure class="frs-gallery-item">
								<a href="<?php echo esc_url( $g_full ); ?>" target="_blank" rel="noopener">
									<img src="<?php echo esc_url( $g_thumb ? $g_thumb : $g_full ); ?>" alt="" loading="lazy">
								</a>
								<figcaption>
									<span class="frs-gallery-name"><?php echo esc_html( $person ? $person : get_the_title( $g->ID ) ); ?></span>
									<span class="frs-gallery-date"><?php echo esc_html( get_the_date( '', $g->ID ) ); ?></span>
									<?php if ( $g_edit ) : ?>
										<a class="frs-gallery-edit" href="<?php echo esc_url( $g_edit ); ?>"><?php esc_html_e( 'Editar SEO', 'frame-studio' ); ?></a>
									<?php endif; ?>
								</figcaption>
							</figure>
						<?php endforeach; ?>
					</div>
				<?php endif; ?>
			</div>

			<div class="frs-card frs-usage">
				<h2><?php esc_html_e( 'Como usar', 'frame-studio' ); ?></h2>
				<p><?php esc_html_e( 'Crie uma página e insira o shortcode abaixo. Os visitantes poderão escolher a moldura, enviar a foto, ajustar e gerar a imagem final.', 'frame-studio' ); ?></p>
				<code class="frs-shortcode" data-frs-copy="[frame_studio]">[frame_studio]</code>
				<button type="button" class="button button-small" data-frs-copy-btn><?php esc_html_e( 'Copiar', 'frame-studio' ); ?></button>
			</div>
		</div>
		<?php
	}
}

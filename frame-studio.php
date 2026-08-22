<?php
/**
 * Plugin Name:       Frame Studio — Gerador de Imagens com Moldura
 * Plugin URI:        https://61labs.com.br/frame-studio
 * Description:       Gerador de imagens para redes sociais com moldura pronta. O admin cadastra molduras PNG (arte com centro transparente) e o usuário, numa página com shortcode, envia uma foto, ajusta com recorte e zoom sobre uma prévia 1080x1920, confirma e gera a imagem final — pronta para baixar e compartilhar no Instagram, Facebook e WhatsApp. Visual neutro e configurável. Desenvolvido pela 61 Labs.
 * Version:           1.6.2
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            61 Labs
 * Author URI:        https://61labs.com.br
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       frame-studio
 * Domain Path:       /languages
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'FRS_VERSION', '1.6.2' );
define( 'FRS_FILE', __FILE__ );
define( 'FRS_DIR', plugin_dir_path( __FILE__ ) );
define( 'FRS_URL', plugin_dir_url( __FILE__ ) );

/*
 * URL do repositório público no GitHub usado para atualizações automáticas.
 */
define( 'FRS_GITHUB_URL', 'https://github.com/meiaumlabs/frame-studio/' );

/*
 * ------------------------------------------------------------------
 * Atualização automática via GitHub (Plugin Update Checker).
 * Fluxo de release: publique uma Release com a tag "vX.Y.Z" e anexe o
 * ZIP do plugin como asset. O WordPress detecta e oferece a atualização.
 * ------------------------------------------------------------------
 */
require_once FRS_DIR . 'includes/plugin-update-checker/plugin-update-checker.php';

$frs_update_checker = \YahnisElsts\PluginUpdateChecker\v5\PucFactory::buildUpdateChecker(
	FRS_GITHUB_URL,
	FRS_FILE,
	'frame-studio'
);
$frs_update_checker->getVcsApi()->enableReleaseAssets();

require_once FRS_DIR . 'includes/class-frs-settings.php';
require_once FRS_DIR . 'includes/class-frs-masks.php';
require_once FRS_DIR . 'includes/class-frs-ajax.php';
require_once FRS_DIR . 'includes/class-frs-shortcode.php';
require_once FRS_DIR . 'includes/class-frs-admin.php';

/**
 * Ativação: grava as opções padrão.
 */
function frs_activate() {
	FRS_Settings::install_defaults();
}
register_activation_hook( __FILE__, 'frs_activate' );

add_action( 'plugins_loaded', function () {
	load_plugin_textdomain( 'frame-studio', false, dirname( plugin_basename( FRS_FILE ) ) . '/languages' );

	FRS_Ajax::init();
	FRS_Shortcode::init();

	if ( is_admin() ) {
		FRS_Admin::init();
	}
} );

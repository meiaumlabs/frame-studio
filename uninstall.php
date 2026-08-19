<?php
/**
 * Desinstalação do Frame Studio.
 *
 * Remove apenas as opções do plugin. As imagens já geradas e enviadas para a
 * biblioteca de mídia são preservadas (pertencem ao conteúdo do site).
 *
 * @package FrameStudio
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'frs_settings' );
delete_option( 'frs_masks' );
delete_transient( 'frs_settings_notice' );

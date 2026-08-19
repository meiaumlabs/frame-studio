/**
 * Frame Studio — admin.
 * Gerencia molduras (wp.media), color pickers e cópia do shortcode.
 */
( function ( $ ) {
	'use strict';

	var A = window.FRS_ADMIN || {};
	var I = A.i18n || {};
	var frame = null;

	function post( action, data ) {
		data = data || {};
		data.action = action;
		data.nonce = A.nonce;
		return $.post( A.ajaxUrl, data );
	}

	$( function () {
		// Color pickers.
		if ( $.fn.wpColorPicker ) {
			$( '.frs-color' ).wpColorPicker();
		}

		var $masks = $( '[data-frs-masks]' );

		// Adicionar moldura via biblioteca de mídia.
		$( '[data-frs-add]' ).on( 'click', function ( e ) {
			e.preventDefault();

			if ( frame ) {
				frame.open();
				return;
			}

			frame = wp.media( {
				title: I.pickTitle || 'Escolher moldura PNG',
				button: { text: I.pickButton || 'Usar esta moldura' },
				library: { type: 'image' },
				multiple: false
			} );

			frame.on( 'select', function () {
				var att = frame.state().get( 'selection' ).first().toJSON();

				if ( att.mime !== 'image/png' ) {
					window.alert( I.onlyPng || 'A moldura precisa ser um PNG com fundo transparente.' );
					return;
				}

				// Aviso de proporção diferente da tela configurada.
				if ( att.width && att.height && A.canvasW && A.canvasH ) {
					var target = A.canvasW / A.canvasH;
					var actual = att.width / att.height;
					if ( Math.abs( target - actual ) > 0.02 ) {
						var msg = ( I.sizeWarn || 'Proporção diferente de %s.' ).replace( '%s', A.canvasW + '×' + A.canvasH );
						if ( ! window.confirm( msg + '\n\nAdicionar mesmo assim?' ) ) {
							return;
						}
					}
				}

				var $btn = $( '[data-frs-add]' );
				var label = $btn.html();
				$btn.prop( 'disabled', true ).text( I.adding || 'Adicionando…' );

				post( 'frs_add_mask', { attachment_id: att.id, title: att.title || '' } )
					.done( function ( res ) {
						if ( res && res.success && res.data && res.data.mask ) {
							addMaskCard( res.data.mask );
						} else {
							window.alert( ( res && res.data && res.data.message ) || I.genericErr || 'Erro.' );
						}
					} )
					.fail( function () {
						window.alert( I.genericErr || 'Erro.' );
					} )
					.always( function () {
						$btn.prop( 'disabled', false ).html( label );
					} );
			} );

			frame.open();
		} );

		// Remover moldura.
		$masks.on( 'click', '[data-frs-del]', function () {
			var $item = $( this ).closest( '.frs-mask-item' );
			var id = $item.data( 'mask-id' );
			if ( ! window.confirm( I.confirmDel || 'Remover esta moldura?' ) ) {
				return;
			}
			post( 'frs_remove_mask', { mask_id: id } ).done( function ( res ) {
				if ( res && res.success ) {
					$item.slideUp( 150, function () {
						$item.remove();
					} );
				} else {
					window.alert( ( res && res.data && res.data.message ) || I.genericErr || 'Erro.' );
				}
			} ).fail( function () {
				window.alert( I.genericErr || 'Erro.' );
			} );
		} );

		function addMaskCard( m ) {
			$masks.find( '[data-frs-empty]' ).remove();
			var $card = $(
				'<div class="frs-mask-item">' +
					'<div class="frs-mask-thumb"></div>' +
					'<div class="frs-mask-meta">' +
						'<span class="frs-mask-title"></span>' +
						'<span class="frs-mask-dim"></span>' +
					'</div>' +
					'<button type="button" class="button-link frs-mask-del" data-frs-del></button>' +
				'</div>'
			);
			$card.attr( 'data-mask-id', m.id );
			$card.find( '.frs-mask-thumb' ).css( 'background-image', "url('" + ( m.thumb || m.url ) + "')" );
			$card.find( '.frs-mask-title' ).text( m.title || '(sem título)' );
			$card.find( '.frs-mask-dim' ).text( ( m.w || 0 ) + '×' + ( m.h || 0 ) );
			$card.find( '[data-frs-del]' ).text( 'Remover' );
			$masks.append( $card );
		}

		// Copiar shortcode.
		$( '[data-frs-copy-btn]' ).on( 'click', function () {
			var code = $( '[data-frs-copy]' ).data( 'frs-copy' ) || '[frame_studio]';
			var $b = $( this );
			var old = $b.text();
			var done = function () {
				$b.text( '✓' );
				setTimeout( function () {
					$b.text( old );
				}, 1400 );
			};
			if ( navigator.clipboard ) {
				navigator.clipboard.writeText( code ).then( done );
			} else {
				var ta = document.createElement( 'textarea' );
				ta.value = code;
				document.body.appendChild( ta );
				ta.select();
				document.execCommand( 'copy' );
				document.body.removeChild( ta );
				done();
			}
		} );
	} );
} )( jQuery );

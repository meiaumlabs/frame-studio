/**
 * Frame Studio — app público.
 *
 * Fluxo: escolher moldura → enviar foto → ajustar (arrastar/zoom) sobre a
 * prévia em tamanho real → confirmar → gerar (salva no servidor) → baixar /
 * compartilhar (WhatsApp, Facebook, Instagram, Web Share nativo).
 *
 * Vanilla JS, sem dependências. A composição acontece 100% no canvas em
 * resolução real e o resultado é enviado ao servidor como data URL.
 */
( function () {
	'use strict';

	var D = window.FRS_DATA || {};
	var T = D.i18n || {};

	function t( key, fallback ) {
		return T[ key ] || fallback || key;
	}

	function el( tag, cls, attrs ) {
		var node = document.createElement( tag );
		if ( cls ) {
			node.className = cls;
		}
		if ( attrs ) {
			Object.keys( attrs ).forEach( function ( k ) {
				node.setAttribute( k, attrs[ k ] );
			} );
		}
		return node;
	}

	function loadImage( src ) {
		return new Promise( function ( resolve, reject ) {
			var img = new Image();
			img.onload = function () {
				resolve( img );
			};
			img.onerror = function () {
				reject( new Error( 'image load error' ) );
			};
			img.src = src;
		} );
	}

	function dataUrlToBlob( dataUrl ) {
		var parts = dataUrl.split( ',' );
		var mime = parts[ 0 ].match( /:(.*?);/ )[ 1 ];
		var bin = atob( parts[ 1 ] );
		var len = bin.length;
		var arr = new Uint8Array( len );
		for ( var i = 0; i < len; i++ ) {
			arr[ i ] = bin.charCodeAt( i );
		}
		return new Blob( [ arr ], { type: mime } );
	}

	/* ------------------------------------------------------------------ *
	 * Editor: gerencia canvas, moldura, foto e transformações.
	 * ------------------------------------------------------------------ */
	function Editor( root ) {
		this.root = root;
		this.canvasW = D.canvasW || 1080;
		this.canvasH = D.canvasH || 1920;
		this.bgColor = D.bgColor || '#ffffff';

		this.maskImg = null;   // Image da moldura selecionada.
		this.photoImg = null;  // Image da foto do usuário.

		this.zoom = 1;         // fator sobre o "cover".
		this.offsetX = 0;      // deslocamento em px de canvas.
		this.offsetY = 0;

		this.state = 'mask';   // mask | photo | edit | result
		this.selectedMaskId = null;

		this.build();
	}

	Editor.prototype.build = function () {
		var self = this;
		this.root.innerHTML = '';

		// ---- Seletor de molduras ----
		this.maskBar = el( 'div', 'frs-maskbar' );
		( D.masks || [] ).forEach( function ( m ) {
			var b = el( 'button', 'frs-mask-opt', { type: 'button', 'data-id': m.id, 'aria-label': m.title || 'moldura' } );
			var im = el( 'img' );
			im.src = m.thumb || m.url;
			im.alt = m.title || '';
			b.appendChild( im );
			b.addEventListener( 'click', function () {
				self.selectMask( m );
			} );
			self.maskBar.appendChild( b );
		} );

		// ---- Palco (canvas + dropzone) ----
		this.stage = el( 'div', 'frs-canvas-wrap' );
		this.canvas = el( 'canvas', 'frs-canvas' );
		this.canvas.width = this.canvasW;
		this.canvas.height = this.canvasH;
		this.ctx = this.canvas.getContext( '2d' );
		this.stage.appendChild( this.canvas );

		this.drop = el( 'div', 'frs-drop' );
		this.drop.innerHTML = '<span class="frs-drop-ic">📷</span><span class="frs-drop-tx">' + t( 'dropHere', 'Toque para enviar sua foto' ) + '</span>';
		this.stage.appendChild( this.drop );

		this.hint = el( 'div', 'frs-hint' );
		this.stage.appendChild( this.hint );

		// input file oculto
		this.file = el( 'input', 'frs-file', { type: 'file', accept: 'image/png,image/jpeg,image/jpg,image/webp' } );
		this.file.addEventListener( 'change', function ( e ) {
			if ( e.target.files && e.target.files[ 0 ] ) {
				self.loadPhoto( e.target.files[ 0 ] );
			}
		} );

		this.drop.addEventListener( 'click', function () {
			if ( ! self.selectedMaskId ) {
				self.flash( t( 'errNoMask', 'Selecione uma moldura primeiro.' ) );
				return;
			}
			self.file.click();
		} );
		this.bindDropzone();

		// ---- Controles ----
		this.controls = el( 'div', 'frs-controls' );

		this.zoomWrap = el( 'label', 'frs-zoom' );
		this.zoomWrap.innerHTML = '<span>' + t( 'zoom', 'Zoom' ) + '</span>';
		this.zoomInput = el( 'input', 'frs-zoom-input', { type: 'range', min: '1', max: '4', step: '0.01', value: '1' } );
		this.zoomInput.addEventListener( 'input', function () {
			self.setZoom( parseFloat( self.zoomInput.value ) );
		} );
		this.zoomWrap.appendChild( this.zoomInput );

		this.btnReset = el( 'button', 'frs-btn frs-btn-ghost', { type: 'button' } );
		this.btnReset.textContent = t( 'reset', 'Recomeçar' );
		this.btnReset.addEventListener( 'click', function () {
			self.reset();
		} );

		this.btnConfirm = el( 'button', 'frs-btn frs-btn-primary', { type: 'button' } );
		this.btnConfirm.textContent = t( 'confirm', 'Confirmar e gerar' );
		this.btnConfirm.addEventListener( 'click', function () {
			self.generate();
		} );

		this.controls.appendChild( this.zoomWrap );
		var row = el( 'div', 'frs-controls-row' );
		row.appendChild( this.btnReset );
		row.appendChild( this.btnConfirm );
		this.controls.appendChild( row );

		// ---- Painel de resultado ----
		this.result = el( 'div', 'frs-result' );
		this.result.hidden = true;

		// Montagem
		this.root.appendChild( this.maskBar );
		this.root.appendChild( this.stage );
		this.root.appendChild( this.controls );
		this.root.appendChild( this.result );

		this.bindGestures();
		this.updateState();
		this.render();
	};

	Editor.prototype.flash = function ( msg ) {
		this.hint.textContent = msg;
		this.hint.classList.add( 'is-visible' );
		var self = this;
		clearTimeout( this._flashT );
		this._flashT = setTimeout( function () {
			self.hint.classList.remove( 'is-visible' );
		}, 2600 );
	};

	Editor.prototype.selectMask = function ( m ) {
		var self = this;
		this.selectedMaskId = m.id;
		Array.prototype.forEach.call( this.maskBar.children, function ( c ) {
			c.classList.toggle( 'is-active', c.getAttribute( 'data-id' ) === m.id );
		} );
		loadImage( m.url ).then( function ( img ) {
			self.maskImg = img;
			if ( self.state === 'mask' ) {
				self.state = 'photo';
			}
			self.updateState();
			self.render();
		} ).catch( function () {
			self.flash( t( 'errGeneric', 'Algo deu errado.' ) );
		} );
	};

	Editor.prototype.loadPhoto = function ( fileObj ) {
		var self = this;
		if ( ! /^image\//.test( fileObj.type ) ) {
			this.flash( t( 'errType', 'Envie um arquivo de imagem.' ) );
			return;
		}
		var maxBytes = ( D.maxMb || 12 ) * 1024 * 1024;
		if ( fileObj.size > maxBytes ) {
			this.flash( t( 'errBig', 'A foto excede o tamanho máximo.' ) );
			return;
		}
		var reader = new FileReader();
		reader.onload = function ( e ) {
			loadImage( e.target.result ).then( function ( img ) {
				self.photoImg = img;
				self.zoom = 1;
				self.offsetX = 0;
				self.offsetY = 0;
				self.zoomInput.value = '1';
				self.state = 'edit';
				self.updateState();
				self.render();
			} ).catch( function () {
				self.flash( t( 'errType', 'Envie um arquivo de imagem.' ) );
			} );
		};
		reader.readAsDataURL( fileObj );
	};

	Editor.prototype.baseScale = function () {
		// "cover": a foto cobre todo o canvas em zoom=1.
		if ( ! this.photoImg ) {
			return 1;
		}
		return Math.max( this.canvasW / this.photoImg.width, this.canvasH / this.photoImg.height );
	};

	Editor.prototype.setZoom = function ( z ) {
		this.zoom = Math.max( 1, Math.min( 4, z ) );
		this.render();
	};

	Editor.prototype.render = function () {
		var ctx = this.ctx;
		ctx.clearRect( 0, 0, this.canvasW, this.canvasH );

		// Fundo.
		ctx.fillStyle = this.bgColor;
		ctx.fillRect( 0, 0, this.canvasW, this.canvasH );

		// Foto do usuário (atrás).
		if ( this.photoImg ) {
			var s = this.baseScale() * this.zoom;
			var dw = this.photoImg.width * s;
			var dh = this.photoImg.height * s;
			var dx = ( this.canvasW - dw ) / 2 + this.offsetX;
			var dy = ( this.canvasH - dh ) / 2 + this.offsetY;
			ctx.drawImage( this.photoImg, dx, dy, dw, dh );
		}

		// Moldura (por cima, com centro transparente).
		if ( this.maskImg ) {
			ctx.drawImage( this.maskImg, 0, 0, this.canvasW, this.canvasH );
		}
	};

	Editor.prototype.updateState = function () {
		var editing = this.state === 'edit';
		var isResult = this.state === 'result';
		this.drop.hidden = !! this.photoImg || isResult;
		this.controls.hidden = ! editing;
		this.canvas.classList.toggle( 'is-draggable', editing );
		this.stage.hidden = isResult;
		this.maskBar.hidden = isResult;
		this.result.hidden = ! isResult;

		if ( this.state === 'mask' ) {
			this.drop.querySelector( '.frs-drop-tx' ).textContent = t( 'chooseMask', 'Escolha uma moldura' );
		} else {
			this.drop.querySelector( '.frs-drop-tx' ).textContent = t( 'dropHere', 'Toque para enviar sua foto' );
		}
	};

	/* ---- Gestos: arrastar + pinça + roda ---- */
	Editor.prototype.scaleFactor = function () {
		var rect = this.canvas.getBoundingClientRect();
		return rect.width ? this.canvasW / rect.width : 1;
	};

	Editor.prototype.bindGestures = function () {
		var self = this;
		var pointers = {};
		var lastDist = 0;
		var dragging = false;
		var last = null;

		function isEdit() {
			return self.state === 'edit' && self.photoImg;
		}

		this.canvas.addEventListener( 'pointerdown', function ( e ) {
			if ( ! isEdit() ) {
				return;
			}
			self.canvas.setPointerCapture( e.pointerId );
			pointers[ e.pointerId ] = { x: e.clientX, y: e.clientY };
			var keys = Object.keys( pointers );
			if ( keys.length === 1 ) {
				dragging = true;
				last = { x: e.clientX, y: e.clientY };
			} else if ( keys.length === 2 ) {
				lastDist = distance( pointers );
			}
		} );

		this.canvas.addEventListener( 'pointermove', function ( e ) {
			if ( ! isEdit() || ! pointers[ e.pointerId ] ) {
				return;
			}
			pointers[ e.pointerId ] = { x: e.clientX, y: e.clientY };
			var keys = Object.keys( pointers );

			if ( keys.length >= 2 ) {
				// Pinça: ajusta zoom.
				var d = distance( pointers );
				if ( lastDist ) {
					var ratio = d / lastDist;
					self.setZoom( self.zoom * ratio );
					self.zoomInput.value = String( self.zoom );
				}
				lastDist = d;
				dragging = false;
				return;
			}

			if ( dragging && last ) {
				var sf = self.scaleFactor();
				self.offsetX += ( e.clientX - last.x ) * sf;
				self.offsetY += ( e.clientY - last.y ) * sf;
				last = { x: e.clientX, y: e.clientY };
				self.render();
			}
		} );

		function endPointer( e ) {
			delete pointers[ e.pointerId ];
			if ( Object.keys( pointers ).length < 2 ) {
				lastDist = 0;
			}
			if ( Object.keys( pointers ).length === 0 ) {
				dragging = false;
				last = null;
			}
		}
		this.canvas.addEventListener( 'pointerup', endPointer );
		this.canvas.addEventListener( 'pointercancel', endPointer );

		this.canvas.addEventListener( 'wheel', function ( e ) {
			if ( ! isEdit() ) {
				return;
			}
			e.preventDefault();
			var delta = e.deltaY < 0 ? 1.06 : 0.94;
			self.setZoom( self.zoom * delta );
			self.zoomInput.value = String( self.zoom );
		}, { passive: false } );

		function distance( p ) {
			var k = Object.keys( p );
			var a = p[ k[ 0 ] ];
			var b = p[ k[ 1 ] ];
			return Math.hypot( a.x - b.x, a.y - b.y );
		}
	};

	Editor.prototype.bindDropzone = function () {
		var self = this;
		[ 'dragenter', 'dragover' ].forEach( function ( ev ) {
			self.drop.addEventListener( ev, function ( e ) {
				e.preventDefault();
				self.drop.classList.add( 'is-over' );
			} );
		} );
		[ 'dragleave', 'drop' ].forEach( function ( ev ) {
			self.drop.addEventListener( ev, function ( e ) {
				e.preventDefault();
				self.drop.classList.remove( 'is-over' );
			} );
		} );
		this.drop.addEventListener( 'drop', function ( e ) {
			if ( ! self.selectedMaskId ) {
				self.flash( t( 'errNoMask', 'Selecione uma moldura primeiro.' ) );
				return;
			}
			var dt = e.dataTransfer;
			if ( dt && dt.files && dt.files[ 0 ] ) {
				self.loadPhoto( dt.files[ 0 ] );
			}
		} );
	};

	Editor.prototype.reset = function () {
		this.photoImg = null;
		this.zoom = 1;
		this.offsetX = 0;
		this.offsetY = 0;
		this.zoomInput.value = '1';
		this.state = this.maskImg ? 'photo' : 'mask';
		this.file.value = '';
		this.result.hidden = true;
		this.updateState();
		this.render();
	};

	/* ---- Geração + envio ---- */
	Editor.prototype.generate = function () {
		var self = this;
		if ( ! this.maskImg ) {
			this.flash( t( 'errNoMask', 'Selecione uma moldura primeiro.' ) );
			return;
		}
		if ( ! this.photoImg ) {
			this.flash( t( 'errNoPhoto', 'Envie uma foto primeiro.' ) );
			return;
		}

		this.render();

		var format = D.format === 'png' ? 'image/png' : 'image/jpeg';
		var quality = ( D.quality || 92 ) / 100;
		var dataUrl = this.canvas.toDataURL( format, quality );

		this.setLoading( true, t( 'generating', 'Gerando imagem…' ) );

		var body = new FormData();
		body.append( 'action', 'frs_save_image' );
		body.append( 'nonce', D.nonce );
		body.append( 'image', dataUrl );

		fetch( D.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: body } )
			.then( function ( r ) {
				return r.json();
			} )
			.then( function ( res ) {
				self.setLoading( false );
				if ( res && res.success && res.data && res.data.url ) {
					self.showResult( res.data.url, dataUrl, res.data.filename );
				} else {
					var msg = res && res.data && res.data.message ? res.data.message : t( 'errGeneric', 'Algo deu errado.' );
					self.flash( msg );
				}
			} )
			.catch( function () {
				self.setLoading( false );
				self.flash( t( 'errGeneric', 'Algo deu errado.' ) );
			} );
	};

	Editor.prototype.setLoading = function ( on, text ) {
		var loader = this.root.parentNode.querySelector( '[data-frs-loading]' );
		if ( ! loader ) {
			return;
		}
		loader.hidden = ! on;
		var tx = loader.querySelector( '.frs-loading-text' );
		if ( tx ) {
			tx.textContent = text || '';
		}
	};

	Editor.prototype.showResult = function ( url, dataUrl, filename ) {
		var self = this;
		this.state = 'result';
		this.updateState();

		this.result.innerHTML = '';
		var title = el( 'p', 'frs-result-title' );
		title.textContent = t( 'done', 'Pronto! Sua imagem foi gerada.' );

		var preview = el( 'img', 'frs-result-img' );
		preview.src = dataUrl;
		preview.alt = '';

		var actions = el( 'div', 'frs-result-actions' );

		// Baixar
		var dl = el( 'a', 'frs-btn frs-btn-primary', { download: filename || 'frame-studio.jpg' } );
		dl.href = dataUrl;
		dl.textContent = t( 'download', 'Baixar imagem' );
		actions.appendChild( dl );

		// Compartilhar nativo (Web Share com arquivo).
		if ( navigator.share ) {
			var sh = el( 'button', 'frs-btn frs-btn-accent', { type: 'button' } );
			sh.textContent = t( 'share', 'Compartilhar' );
			sh.addEventListener( 'click', function () {
				self.nativeShare( dataUrl, url, filename );
			} );
			actions.appendChild( sh );
		}

		// Redes
		var social = el( 'div', 'frs-social' );

		var wa = el( 'a', 'frs-soc frs-soc-wa', { target: '_blank', rel: 'noopener' } );
		wa.href = 'https://wa.me/?text=' + encodeURIComponent( ( D.shareText ? D.shareText + ' ' : '' ) + url );
		wa.textContent = t( 'shareWhats', 'WhatsApp' );
		social.appendChild( wa );

		var fb = el( 'a', 'frs-soc frs-soc-fb', { target: '_blank', rel: 'noopener' } );
		fb.href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent( url );
		fb.textContent = t( 'shareFace', 'Facebook' );
		social.appendChild( fb );

		var ig = el( 'button', 'frs-soc frs-soc-ig', { type: 'button' } );
		ig.textContent = t( 'shareInsta', 'Instagram' );
		ig.addEventListener( 'click', function () {
			if ( navigator.share ) {
				self.nativeShare( dataUrl, url, filename );
			} else {
				self.flash( t( 'instaHint', 'Baixe a imagem e publique pelo app do Instagram.' ) );
			}
		} );
		social.appendChild( ig );

		// Copiar link
		var copy = el( 'button', 'frs-soc frs-soc-link', { type: 'button' } );
		copy.textContent = t( 'copyLink', 'Copiar link' );
		copy.addEventListener( 'click', function () {
			self.copy( url, copy );
		} );
		social.appendChild( copy );

		var again = el( 'button', 'frs-btn frs-btn-ghost', { type: 'button' } );
		again.textContent = t( 'newImage', 'Gerar outra' );
		again.addEventListener( 'click', function () {
			self.reset();
		} );

		this.result.appendChild( title );
		this.result.appendChild( preview );
		this.result.appendChild( actions );
		this.result.appendChild( social );
		this.result.appendChild( again );
	};

	Editor.prototype.nativeShare = function ( dataUrl, url, filename ) {
		var self = this;
		try {
			var blob = dataUrlToBlob( dataUrl );
			var file = new File( [ blob ], filename || 'frame-studio.jpg', { type: blob.type } );
			var payload = { title: D.shareText || '', text: D.shareText || '' };
			if ( navigator.canShare && navigator.canShare( { files: [ file ] } ) ) {
				payload.files = [ file ];
			} else {
				payload.url = url;
			}
			navigator.share( payload ).catch( function () {} );
		} catch ( err ) {
			if ( navigator.share ) {
				navigator.share( { url: url, text: D.shareText || '' } ).catch( function () {} );
			} else {
				self.flash( t( 'errGeneric', 'Algo deu errado.' ) );
			}
		}
	};

	Editor.prototype.copy = function ( text, btn ) {
		var done = function () {
			var old = btn.textContent;
			btn.textContent = t( 'linkCopied', 'Link copiado!' );
			setTimeout( function () {
				btn.textContent = old;
			}, 1800 );
		};
		if ( navigator.clipboard && navigator.clipboard.writeText ) {
			navigator.clipboard.writeText( text ).then( done ).catch( function () {} );
		} else {
			var ta = document.createElement( 'textarea' );
			ta.value = text;
			document.body.appendChild( ta );
			ta.select();
			try {
				document.execCommand( 'copy' );
				done();
			} catch ( e ) {}
			document.body.removeChild( ta );
		}
	};

	/* ------------------------------------------------------------------ */
	function boot() {
		var apps = document.querySelectorAll( '[data-frs]' );
		Array.prototype.forEach.call( apps, function ( app ) {
			var stage = app.querySelector( '[data-frs-stage]' );
			if ( ! stage || stage.getAttribute( 'data-frs-ready' ) === '1' ) {
				return;
			}
			if ( ! D.masks || ! D.masks.length ) {
				return;
			}
			stage.setAttribute( 'data-frs-ready', '1' );
			var host = el( 'div', 'frs-editor' );
			stage.appendChild( host );
			new Editor( host );
		} );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', boot );
	} else {
		boot();
	}
} )();

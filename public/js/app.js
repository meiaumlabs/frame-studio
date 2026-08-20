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

	/* Ícones SVG inline (herdam a cor do texto via currentColor). */
	var ICONS = {
		download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg>',
		share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5"/></svg>',
		refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>',
		link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>',
		whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.8c2.17 0 4.2.85 5.74 2.38a8.06 8.06 0 0 1 2.38 5.73c0 4.47-3.64 8.11-8.12 8.11a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.13 8.13 0 0 1-1.25-4.35c0-4.47 3.64-8.11 8.12-8.11Zm-2.54 4.28c-.24 0-.63.09-.96.45-.33.36-1.26 1.23-1.26 3s1.29 3.48 1.47 3.72c.18.24 2.53 3.87 6.14 5.28.86.33 1.53.53 2.05.68.86.27 1.65.23 2.27.14.69-.1 2.13-.87 2.43-1.71.3-.84.3-1.56.21-1.71-.09-.15-.33-.24-.69-.42-.36-.18-2.13-1.05-2.46-1.17-.33-.12-.57-.18-.81.18-.24.36-.93 1.17-1.14 1.41-.21.24-.42.27-.78.09-.36-.18-1.52-.56-2.9-1.79-1.07-.95-1.79-2.13-2-2.49-.21-.36-.02-.55.16-.73.16-.16.36-.42.54-.63.18-.21.24-.36.36-.6.12-.24.06-.45-.03-.63-.09-.18-.81-1.95-1.11-2.67-.29-.7-.59-.6-.81-.61-.21-.01-.45-.01-.69-.01Z"/></svg>',
		facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.91 3.78-3.91 1.09 0 2.24.2 2.24.2v2.47H15.2c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.9h-2.34V22c4.78-.76 8.43-4.92 8.43-9.94Z"/></svg>',
		instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>'
	};
	function icon( name ) {
		return '<span class="frs-ico" aria-hidden="true">' + ( ICONS[ name ] || '' ) + '</span>';
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

	/**
	 * Reduz uma imagem para caber num lado máximo, preservando a proporção.
	 * Retorna a própria imagem (se já couber) ou um canvas — ambos desenháveis
	 * por drawImage e com .width/.height. Evita rejeitar fotos grandes de
	 * celular e mantém o uso de memória sob controle.
	 */
	function fitToMax( img, maxDim ) {
		var longest = Math.max( img.width, img.height );
		if ( ! longest || longest <= maxDim ) {
			return img;
		}
		var scale = maxDim / longest;
		var c = document.createElement( 'canvas' );
		c.width = Math.round( img.width * scale );
		c.height = Math.round( img.height * scale );
		c.getContext( '2d' ).drawImage( img, 0, 0, c.width, c.height );
		return c;
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
		this.minZoom = 1;      // recalculado por foto (permite afastar até caber inteira).
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
		this.maskSection = el( 'div', 'frs-maskpick' );
		var mbLabel = el( 'span', 'frs-maskpick-label' );
		mbLabel.textContent = t( 'chooseMask', 'Escolha uma moldura' );
		this.maskSection.appendChild( mbLabel );

		this.maskBar = el( 'div', 'frs-maskbar' );
		( D.masks || [] ).forEach( function ( m ) {
			var b = el( 'button', 'frs-mask-opt', { type: 'button', 'data-id': m.id, 'aria-label': m.title || 'moldura' } );
			var thumb = el( 'span', 'frs-mask-thumb' );
			var im = el( 'img' );
			im.src = m.thumb || m.url;
			im.alt = m.title || '';
			im.loading = 'lazy';
			thumb.appendChild( im );
			b.appendChild( thumb );
			if ( m.title ) {
				var cap = el( 'span', 'frs-mask-cap' );
				cap.textContent = m.title;
				b.appendChild( cap );
			}
			b.addEventListener( 'click', function () {
				self.selectMask( m );
			} );
			self.maskBar.appendChild( b );
		} );
		this.maskSection.appendChild( this.maskBar );

		// ---- Palco (canvas + dropzone) ----
		this.stage = el( 'div', 'frs-canvas-wrap' );
		this.canvas = el( 'canvas', 'frs-canvas' );
		this.canvas.width = this.canvasW;
		this.canvas.height = this.canvasH;
		this.ctx = this.canvas.getContext( '2d' );
		this.stage.appendChild( this.canvas );

		this.drop = el( 'div', 'frs-drop' );
		this.drop.innerHTML =
			'<span class="frs-drop-ic">📷</span>' +
			'<span class="frs-drop-tx">' + t( 'dropHere', 'Toque para enviar sua foto' ) + '</span>' +
			'<span class="frs-drop-tip">' + this.orientationTip() + '</span>';
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

		var tip = el( 'p', 'frs-adjust-tip' );
		tip.innerHTML = '<strong>' + t( 'adjustTitle', 'Ajuste sua foto' ) + '</strong> ' +
			t( 'adjust', 'Arraste para posicionar e use − / + para aproximar ou afastar.' );
		this.controls.appendChild( tip );

		// Linha de zoom: [−] slider [+] com porcentagem.
		this.zoomWrap = el( 'div', 'frs-zoom' );

		var zoomOut = el( 'button', 'frs-zoom-btn', { type: 'button', 'aria-label': t( 'zoomOut', 'Afastar' ) } );
		zoomOut.textContent = '−';
		zoomOut.addEventListener( 'click', function () {
			self.nudgeZoom( -0.15 );
		} );

		this.zoomInput = el( 'input', 'frs-zoom-input', { type: 'range', min: '1', max: '4', step: '0.01', value: '1', 'aria-label': t( 'zoom', 'Zoom' ) } );
		this.zoomInput.addEventListener( 'input', function () {
			self.setZoom( parseFloat( self.zoomInput.value ) );
			self.updateZoomLabel();
		} );

		var zoomIn = el( 'button', 'frs-zoom-btn', { type: 'button', 'aria-label': t( 'zoomIn', 'Aproximar' ) } );
		zoomIn.textContent = '+';
		zoomIn.addEventListener( 'click', function () {
			self.nudgeZoom( 0.15 );
		} );

		this.zoomLabel = el( 'span', 'frs-zoom-val' );

		this.zoomWrap.appendChild( zoomOut );
		this.zoomWrap.appendChild( this.zoomInput );
		this.zoomWrap.appendChild( zoomIn );
		this.zoomWrap.appendChild( this.zoomLabel );
		this.controls.appendChild( this.zoomWrap );

		// Ações rápidas: enquadrar (foto inteira) / preencher (cover).
		var quick = el( 'div', 'frs-quick' );
		this.btnFit = el( 'button', 'frs-chip', { type: 'button' } );
		this.btnFit.textContent = t( 'fitWhole', 'Foto inteira' );
		this.btnFit.addEventListener( 'click', function () {
			self.frameFit();
		} );
		this.btnFill = el( 'button', 'frs-chip', { type: 'button' } );
		this.btnFill.textContent = t( 'fillFrame', 'Preencher' );
		this.btnFill.addEventListener( 'click', function () {
			self.frameFill();
		} );
		quick.appendChild( this.btnFit );
		quick.appendChild( this.btnFill );
		this.controls.appendChild( quick );

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

		var row = el( 'div', 'frs-controls-row' );
		row.appendChild( this.btnReset );
		row.appendChild( this.btnConfirm );
		this.controls.appendChild( row );

		// ---- Painel de resultado ----
		this.result = el( 'div', 'frs-result' );
		this.result.hidden = true;

		// Montagem
		this.root.appendChild( this.maskSection );
		this.root.appendChild( this.stage );
		this.root.appendChild( this.controls );
		this.root.appendChild( this.result );

		// Uma única moldura: aplica automaticamente e esconde o seletor.
		this.autoMask = ( D.masks && D.masks.length === 1 ) ? D.masks[ 0 ] : null;

		this.bindGestures();
		this.updateState();
		this.render();

		if ( this.autoMask ) {
			this.selectMask( this.autoMask );
		}
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
		var reader = new FileReader();
		reader.onload = function ( e ) {
			loadImage( e.target.result ).then( function ( img ) {
				// Fotos grandes são redimensionadas no navegador em vez de
				// rejeitadas: 2560px no lado maior mantém nitidez sobre a
				// prévia (canvas 1080×1920, até 4× de zoom) sem estourar a
				// memória em celulares.
				self.photoImg = fitToMax( img, 2560 );
				self.origW = img.width;
				self.origH = img.height;
				self.minZoom = self.fitZoom();
				self.zoom = 1;
				self.offsetX = 0;
				self.offsetY = 0;
				self.zoomInput.min = String( self.minZoom );
				self.zoomInput.value = '1';
				self.state = 'edit';
				self.updateState();
				self.updateZoomLabel();
				self.render();

				// Orientação diferente do quadro: sugere, sem bloquear.
				var frameKind = self.canvasH > self.canvasW ? 'p' : ( self.canvasW > self.canvasH ? 'l' : 's' );
				var photoKind = img.height > img.width ? 'p' : ( img.width > img.height ? 'l' : 's' );
				if ( frameKind !== 's' && photoKind !== 's' && frameKind !== photoKind ) {
					self.flash( t( 'orMismatch', 'Dica: esta moldura fica melhor com foto ' ) + (
						frameKind === 'p' ? t( 'orPortrait', 'na vertical (retrato)' ) : t( 'orLandscape', 'na horizontal (paisagem)' )
					) + '.' );
				}
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

	/**
	 * Zoom (relativo ao "cover") em que a foto inteira cabe no canvas.
	 * É ≤ 1: permite afastar até ver a imagem completa, com o fundo
	 * preenchendo as sobras. Quando as proporções batem, vale 1 (cover).
	 */
	Editor.prototype.fitZoom = function () {
		if ( ! this.photoImg ) {
			return 1;
		}
		var cover   = Math.max( this.canvasW / this.photoImg.width, this.canvasH / this.photoImg.height );
		var contain = Math.min( this.canvasW / this.photoImg.width, this.canvasH / this.photoImg.height );
		return cover ? contain / cover : 1;
	};

	Editor.prototype.setZoom = function ( z ) {
		var min = this.minZoom || 1;
		this.zoom = Math.max( min, Math.min( 4, z ) );
		this.render();
	};

	/* Aproxima/afasta em passos (botões − / +). */
	Editor.prototype.nudgeZoom = function ( delta ) {
		this.setZoom( this.zoom + delta );
		if ( this.zoomInput ) {
			this.zoomInput.value = String( this.zoom );
		}
		this.updateZoomLabel();
	};

	/* Mostra o zoom como porcentagem relativa ao "preencher" (cover = 100%). */
	Editor.prototype.updateZoomLabel = function () {
		if ( this.zoomLabel ) {
			this.zoomLabel.textContent = Math.round( this.zoom * 100 ) + '%';
		}
	};

	/* Enquadra a foto inteira dentro do quadro (o fundo preenche as sobras). */
	Editor.prototype.frameFit = function () {
		this.minZoom = this.fitZoom();
		this.offsetX = 0;
		this.offsetY = 0;
		this.setZoom( this.minZoom );
		if ( this.zoomInput ) {
			this.zoomInput.value = String( this.zoom );
		}
		this.updateZoomLabel();
	};

	/* Preenche todo o quadro com a foto (cover). */
	Editor.prototype.frameFill = function () {
		this.offsetX = 0;
		this.offsetY = 0;
		this.setZoom( 1 );
		if ( this.zoomInput ) {
			this.zoomInput.value = '1';
		}
		this.updateZoomLabel();
	};

	/* Orientação/tamanho ideal derivados do quadro configurado. */
	Editor.prototype.orientationTip = function () {
		var w = this.canvasW;
		var h = this.canvasH;
		var kind = ( w === h )
			? t( 'orSquare', 'quadrada' )
			: ( h > w ? t( 'orPortrait', 'na vertical (retrato)' ) : t( 'orLandscape', 'na horizontal (paisagem)' ) );
		return t( 'idealPrefix', 'Ideal: foto ' ) + kind + ' • ' + w + '×' + h + ' px';
	};

	/**
	 * Desenha a composição. Com forExport=true, não desenha guias (limites da
	 * foto) — a imagem final sai limpa, só foto + moldura, sem escurecer nem
	 * marcações.
	 */
	Editor.prototype.render = function ( forExport ) {
		var ctx = this.ctx;
		// Suavização máxima preserva a qualidade ao escalar a foto.
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';

		ctx.clearRect( 0, 0, this.canvasW, this.canvasH );

		// Fundo.
		ctx.fillStyle = this.bgColor;
		ctx.fillRect( 0, 0, this.canvasW, this.canvasH );

		var box = null;

		// Foto do usuário (atrás).
		if ( this.photoImg ) {
			var s = this.baseScale() * this.zoom;
			var dw = this.photoImg.width * s;
			var dh = this.photoImg.height * s;
			var dx = ( this.canvasW - dw ) / 2 + this.offsetX;
			var dy = ( this.canvasH - dh ) / 2 + this.offsetY;
			ctx.drawImage( this.photoImg, dx, dy, dw, dh );
			box = { x: dx, y: dy, w: dw, h: dh };
		}

		// Moldura (por cima, com centro transparente).
		if ( this.maskImg ) {
			ctx.drawImage( this.maskImg, 0, 0, this.canvasW, this.canvasH );
		}

		// Guias dos limites da foto — só na edição, nunca na exportação.
		if ( ! forExport && this.state === 'edit' && box ) {
			this.drawPhotoBounds( ctx, box );
		}
	};

	/**
	 * Contorno tracejado mostrando até onde a foto enviada se estende — ajuda a
	 * pessoa a enxergar as bordas e o que fica de fora do quadro.
	 */
	Editor.prototype.drawPhotoBounds = function ( ctx, box ) {
		var lw = Math.max( 2, this.canvasW / 300 );
		ctx.save();
		// Traço branco por baixo (contraste em fundos escuros).
		ctx.lineWidth = lw + 2;
		ctx.strokeStyle = 'rgba(255,255,255,0.9)';
		ctx.setLineDash( [ lw * 4, lw * 3 ] );
		ctx.strokeRect( box.x + lw, box.y + lw, box.w - lw * 2, box.h - lw * 2 );
		// Traço colorido por cima.
		ctx.lineWidth = lw;
		ctx.strokeStyle = 'rgba(47,111,237,0.95)';
		ctx.strokeRect( box.x + lw, box.y + lw, box.w - lw * 2, box.h - lw * 2 );
		ctx.restore();
	};

	Editor.prototype.updateState = function () {
		var editing = this.state === 'edit';
		var isResult = this.state === 'result';
		this.drop.hidden = !! this.photoImg || isResult;
		this.controls.hidden = ! editing;
		this.canvas.classList.toggle( 'is-draggable', editing );
		this.stage.hidden = isResult;
		this.maskSection.hidden = isResult || !! this.autoMask;
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
					self.updateZoomLabel();
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
			self.updateZoomLabel();
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
		this.minZoom = 1;
		this.offsetX = 0;
		this.offsetY = 0;
		this.zoomInput.min = '1';
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

		// Pede o nome (para arquivar/SEO) antes de gerar, se habilitado.
		if ( D.askName ) {
			this.openNameModal( function ( name ) {
				self.doGenerate( name );
			} );
		} else {
			this.doGenerate( '' );
		}
	};

	Editor.prototype.doGenerate = function ( name ) {
		var self = this;

		// Exporta limpo (sem guias) para não escurecer nem marcar a imagem.
		this.render( true );

		var format = D.format === 'png' ? 'image/png' : 'image/jpeg';
		var quality = ( D.quality || 92 ) / 100;
		var dataUrl = this.canvas.toDataURL( format, quality );

		this.setLoading( true, t( 'generating', 'Gerando imagem…' ) );

		var body = new FormData();
		body.append( 'action', 'frs_save_image' );
		body.append( 'nonce', D.nonce );
		body.append( 'image', dataUrl );
		body.append( 'name', name || '' );

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

	/**
	 * Modal simples pedindo o nome da pessoa. Fechado/estilizado dentro do
	 * próprio widget (sem herdar nada do tema).
	 */
	Editor.prototype.openNameModal = function ( onConfirm ) {
		var self = this;
		var overlay = el( 'div', 'frs-modal' );
		var card = el( 'div', 'frs-modal-card' );

		var h = el( 'p', 'frs-modal-title' );
		h.textContent = t( 'nameTitle', 'Quase lá! Qual é o seu nome?' );

		var sub = el( 'p', 'frs-modal-sub' );
		sub.textContent = t( 'nameSub', 'Usamos seu nome para nomear e organizar a imagem gerada.' );

		var input = el( 'input', 'frs-modal-input', { type: 'text', maxlength: '60', placeholder: t( 'namePlaceholder', 'Seu nome' ) } );

		var err = el( 'p', 'frs-modal-err' );
		err.hidden = true;
		err.textContent = t( 'nameRequired', 'Por favor, digite seu nome.' );

		var row = el( 'div', 'frs-modal-row' );
		var cancel = el( 'button', 'frs-btn frs-btn-ghost', { type: 'button' } );
		cancel.textContent = t( 'cancel', 'Cancelar' );
		var ok = el( 'button', 'frs-btn frs-btn-primary', { type: 'button' } );
		ok.textContent = t( 'continue', 'Gerar imagem' );

		function close() {
			overlay.parentNode && overlay.parentNode.removeChild( overlay );
		}
		function submit() {
			var v = ( input.value || '' ).trim();
			if ( v.length < 2 ) {
				err.hidden = false;
				input.focus();
				return;
			}
			close();
			onConfirm( v );
		}

		cancel.addEventListener( 'click', close );
		ok.addEventListener( 'click', submit );
		input.addEventListener( 'keydown', function ( e ) {
			if ( e.key === 'Enter' ) {
				submit();
			}
		} );
		overlay.addEventListener( 'click', function ( e ) {
			if ( e.target === overlay ) {
				close();
			}
		} );

		row.appendChild( cancel );
		row.appendChild( ok );
		card.appendChild( h );
		card.appendChild( sub );
		card.appendChild( input );
		card.appendChild( err );
		card.appendChild( row );
		overlay.appendChild( card );
		this.root.appendChild( overlay );
		setTimeout( function () {
			input.focus();
		}, 30 );
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

		// Baixar (ação principal).
		var dl = el( 'a', 'frs-btn frs-btn-primary', { download: filename || 'frame-studio.jpg' } );
		dl.href = dataUrl;
		dl.innerHTML = icon( 'download' ) + '<span>' + t( 'download', 'Baixar imagem' ) + '</span>';
		actions.appendChild( dl );

		// Compartilhar nativo (Web Share com arquivo).
		if ( navigator.share ) {
			var sh = el( 'button', 'frs-btn frs-btn-accent', { type: 'button' } );
			sh.innerHTML = icon( 'share' ) + '<span>' + t( 'share', 'Compartilhar' ) + '</span>';
			sh.addEventListener( 'click', function () {
				self.nativeShare( dataUrl, url, filename );
			} );
			actions.appendChild( sh );
		}

		// Redes sociais.
		var socialLabel = el( 'span', 'frs-social-label' );
		socialLabel.textContent = t( 'share', 'Compartilhar' );

		var social = el( 'div', 'frs-social' );

		var wa = el( 'a', 'frs-soc frs-soc-wa', { target: '_blank', rel: 'noopener' } );
		wa.href = 'https://wa.me/?text=' + encodeURIComponent( ( D.shareText ? D.shareText + ' ' : '' ) + url );
		wa.innerHTML = icon( 'whatsapp' ) + '<span>' + t( 'shareWhats', 'WhatsApp' ) + '</span>';
		social.appendChild( wa );

		var fb = el( 'a', 'frs-soc frs-soc-fb', { target: '_blank', rel: 'noopener' } );
		fb.href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent( url );
		fb.innerHTML = icon( 'facebook' ) + '<span>' + t( 'shareFace', 'Facebook' ) + '</span>';
		social.appendChild( fb );

		var ig = el( 'button', 'frs-soc frs-soc-ig', { type: 'button' } );
		ig.innerHTML = icon( 'instagram' ) + '<span>' + t( 'shareInsta', 'Instagram' ) + '</span>';
		ig.addEventListener( 'click', function () {
			if ( navigator.share ) {
				self.nativeShare( dataUrl, url, filename );
			} else {
				self.flash( t( 'instaHint', 'Baixe a imagem e publique pelo app do Instagram.' ) );
			}
		} );
		social.appendChild( ig );

		// Copiar link.
		var copy = el( 'button', 'frs-soc frs-soc-link', { type: 'button' } );
		copy.innerHTML = icon( 'link' ) + '<span>' + t( 'copyLink', 'Copiar link' ) + '</span>';
		copy.addEventListener( 'click', function () {
			self.copy( url, copy );
		} );
		social.appendChild( copy );

		var again = el( 'button', 'frs-btn frs-btn-ghost frs-btn-again', { type: 'button' } );
		again.innerHTML = icon( 'refresh' ) + '<span>' + t( 'newImage', 'Gerar outra' ) + '</span>';
		again.addEventListener( 'click', function () {
			self.reset();
		} );

		this.result.appendChild( title );
		this.result.appendChild( preview );
		this.result.appendChild( actions );
		this.result.appendChild( socialLabel );
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

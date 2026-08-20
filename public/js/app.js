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

	/* Ícones da biblioteca Tabler (webfont embutido). Ver .frs-ico no CSS. */
	function icon( name ) {
		return '<i class="frs-ico frs-ico-' + name + '" aria-hidden="true"></i>';
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

		this.zoomInput = el( 'input', 'frs-zoom-input', { type: 'range', min: '0.1', max: '8', step: '0.01', value: '1', 'aria-label': t( 'zoom', 'Zoom' ) } );
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
		// Livre: de bem pequeno (10%) a bem grande (800%) — a pessoa ajusta como
		// quiser, sem travar no tamanho original da foto.
		this.zoom = Math.max( 0.1, Math.min( 8, z ) );
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
		this.photoBox = box;

		// Moldura (por cima, com centro transparente).
		if ( this.maskImg ) {
			ctx.drawImage( this.maskImg, 0, 0, this.canvasW, this.canvasH );
		}

		// Guias + alças dos limites da foto — só na edição, nunca na exportação.
		if ( ! forExport && this.state === 'edit' && box ) {
			this.drawPhotoBounds( ctx, box );
		}
	};

	/**
	 * Contorno tracejado + alças nos cantos. As alças podem ser arrastadas para
	 * redimensionar a foto proporcionalmente (o zoom acompanha).
	 */
	Editor.prototype.drawPhotoBounds = function ( ctx, box ) {
		var lw = Math.max( 2, this.canvasW / 300 );
		var blue = 'rgba(37,99,235,0.95)';
		ctx.save();
		// Contorno: traço branco por baixo (contraste) + azul por cima.
		ctx.setLineDash( [ lw * 4, lw * 3 ] );
		ctx.lineWidth = lw + 2;
		ctx.strokeStyle = 'rgba(255,255,255,0.9)';
		ctx.strokeRect( box.x + lw, box.y + lw, box.w - lw * 2, box.h - lw * 2 );
		ctx.lineWidth = lw;
		ctx.strokeStyle = blue;
		ctx.strokeRect( box.x + lw, box.y + lw, box.w - lw * 2, box.h - lw * 2 );

		// Alças nos 4 cantos.
		ctx.setLineDash( [] );
		var r = this.handleRadius();
		var corners = this.boxCorners( box );
		for ( var i = 0; i < corners.length; i++ ) {
			var c = corners[ i ];
			ctx.beginPath();
			ctx.arc( c.x, c.y, r, 0, Math.PI * 2 );
			ctx.fillStyle = '#ffffff';
			ctx.fill();
			ctx.lineWidth = lw + 1;
			ctx.strokeStyle = blue;
			ctx.stroke();
		}
		ctx.restore();
	};

	/* Raio (em px de canvas) das alças de canto e da zona de toque. */
	Editor.prototype.handleRadius = function () {
		return Math.max( 16, this.canvasW * 0.03 );
	};
	Editor.prototype.boxCorners = function ( box ) {
		return [
			{ x: box.x, y: box.y },
			{ x: box.x + box.w, y: box.y },
			{ x: box.x, y: box.y + box.h },
			{ x: box.x + box.w, y: box.y + box.h }
		];
	};
	Editor.prototype.boxCenter = function () {
		return { x: this.canvasW / 2 + this.offsetX, y: this.canvasH / 2 + this.offsetY };
	};
	/* Converte coordenadas de tela para coordenadas do canvas. */
	Editor.prototype.toCanvas = function ( clientX, clientY ) {
		var rect = this.canvas.getBoundingClientRect();
		var sx = rect.width ? this.canvasW / rect.width : 1;
		var sy = rect.height ? this.canvasH / rect.height : 1;
		return { x: ( clientX - rect.left ) * sx, y: ( clientY - rect.top ) * sy };
	};
	/* True se o ponto (canvas) está sobre uma alça de canto. */
	Editor.prototype.cornerHit = function ( p ) {
		if ( ! this.photoBox ) {
			return false;
		}
		var hit = this.handleRadius() * 1.8;
		var corners = this.boxCorners( this.photoBox );
		for ( var i = 0; i < corners.length; i++ ) {
			if ( Math.hypot( p.x - corners[ i ].x, p.y - corners[ i ].y ) <= hit ) {
				return true;
			}
		}
		return false;
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
		var resizing = false;
		var resizeStartZoom = 1;
		var resizeStartDist = 1;
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
				// Um dedo sobre um canto = redimensionar; caso contrário, arrastar.
				var p = self.toCanvas( e.clientX, e.clientY );
				if ( self.cornerHit( p ) ) {
					resizing = true;
					var c = self.boxCenter();
					resizeStartZoom = self.zoom;
					resizeStartDist = Math.max( 1, Math.hypot( p.x - c.x, p.y - c.y ) );
				} else {
					dragging = true;
					last = { x: e.clientX, y: e.clientY };
				}
			} else if ( keys.length === 2 ) {
				resizing = false;
				lastDist = distance( pointers );
			}
		} );

		this.canvas.addEventListener( 'pointermove', function ( e ) {
			if ( ! isEdit() || ! pointers[ e.pointerId ] ) {
				return;
			}
			pointers[ e.pointerId ] = { x: e.clientX, y: e.clientY };
			var keys = Object.keys( pointers );

			// Redimensionar arrastando um canto (proporcional, a partir do centro).
			if ( resizing && keys.length === 1 ) {
				var pr = self.toCanvas( e.clientX, e.clientY );
				var cc = self.boxCenter();
				var dd = Math.hypot( pr.x - cc.x, pr.y - cc.y );
				self.setZoom( resizeStartZoom * ( dd / resizeStartDist ) );
				self.zoomInput.value = String( self.zoom );
				self.updateZoomLabel();
				return;
			}

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
				resizing = false;
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

		// Cursor de redimensionar ao passar sobre uma alça (desktop).
		this.canvas.addEventListener( 'mousemove', function ( e ) {
			if ( ! isEdit() || Object.keys( pointers ).length ) {
				return;
			}
			var p = self.toCanvas( e.clientX, e.clientY );
			self.canvas.style.cursor = self.cornerHit( p ) ? 'nwse-resize' : '';
		} );

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

		// Redes sociais — botões pequenos, só ícone (rótulo via aria-label/title).
		var socialLabel = el( 'span', 'frs-social-label' );
		socialLabel.textContent = t( 'shareOn', 'Compartilhar em' );

		var social = el( 'div', 'frs-social' );

		var wa = el( 'a', 'frs-soc frs-soc-wa', { target: '_blank', rel: 'noopener', 'aria-label': t( 'shareWhats', 'WhatsApp' ), title: t( 'shareWhats', 'WhatsApp' ) } );
		wa.href = 'https://wa.me/?text=' + encodeURIComponent( ( D.shareText ? D.shareText + ' ' : '' ) + url );
		wa.innerHTML = icon( 'whatsapp' );
		social.appendChild( wa );

		var fb = el( 'a', 'frs-soc frs-soc-fb', { target: '_blank', rel: 'noopener', 'aria-label': t( 'shareFace', 'Facebook' ), title: t( 'shareFace', 'Facebook' ) } );
		fb.href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent( url );
		fb.innerHTML = icon( 'facebook' );
		social.appendChild( fb );

		var igText = t( 'shareInsta', 'Instagram' );
		var ig = el( 'button', 'frs-soc frs-soc-ig', { type: 'button', 'aria-label': igText + ' (Stories)', title: igText + ' — Stories' } );
		ig.innerHTML = icon( 'instagram' );
		ig.addEventListener( 'click', function () {
			self.shareToStory( dataUrl, url, filename );
		} );
		social.appendChild( ig );

		// Copiar link.
		var copy = el( 'button', 'frs-soc frs-soc-link', { type: 'button', 'aria-label': t( 'copyLink', 'Copiar link' ), title: t( 'copyLink', 'Copiar link' ) } );
		copy.innerHTML = icon( 'link' );
		copy.addEventListener( 'click', function () {
			self.copy( url, copy );
		} );
		social.appendChild( copy );

		var again = el( 'button', 'frs-btn frs-btn-ghost frs-btn-again', { type: 'button' } );
		again.innerHTML = icon( 'refresh' ) + '<span>' + t( 'newImage', 'Gerar outra' ) + '</span>';
		again.addEventListener( 'click', function () {
			self.reset();
		} );

		// Aviso contextual (ex.: instruções do Instagram) visível no resultado.
		this.resultNote = el( 'p', 'frs-result-note' );
		this.resultNote.hidden = true;

		this.result.appendChild( title );
		this.result.appendChild( preview );
		this.result.appendChild( actions );
		this.result.appendChild( socialLabel );
		this.result.appendChild( social );
		this.result.appendChild( this.resultNote );
		this.result.appendChild( again );
	};

	Editor.prototype.showNote = function ( msg ) {
		if ( ! this.resultNote ) {
			return;
		}
		this.resultNote.textContent = msg;
		this.resultNote.hidden = false;
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

	/**
	 * Instagram Stories. No celular, o melhor caminho é compartilhar o ARQUIVO
	 * (o usuário escolhe Instagram → Stories); há ainda uma tentativa de abrir
	 * a câmera de Stories por deep link. No desktop, orienta a usar o app.
	 */
	Editor.prototype.shareToStory = function ( dataUrl, url, filename ) {
		var self = this;
		var isMobile = /android|iphone|ipad|ipod/i.test( navigator.userAgent || '' );

		// 1) Compartilhar o arquivo pela folha nativa (permite Stories).
		try {
			var blob = dataUrlToBlob( dataUrl );
			var file = new File( [ blob ], filename || 'frame-studio.jpg', { type: blob.type } );
			if ( navigator.canShare && navigator.canShare( { files: [ file ] } ) ) {
				navigator.share( { files: [ file ], title: D.shareText || '', text: D.shareText || '' } ).catch( function () {} );
				self.showNote( t( 'instaStory', 'No menu de compartilhamento, toque em Instagram → Stories.' ) );
				return;
			}
		} catch ( e ) {}

		// 2) Deep link para a câmera de Stories do app.
		if ( isMobile ) {
			self.showNote( t( 'instaHint', 'Baixe a imagem e publique nos Stories pelo app do Instagram.' ) );
			setTimeout( function () {
				window.location.href = 'instagram://story-camera';
			}, 500 );
			return;
		}

		// 3) Desktop.
		self.showNote( t( 'instaHint', 'Baixe a imagem e publique nos Stories pelo app do Instagram.' ) );
	};

	Editor.prototype.copy = function ( text, btn ) {
		var self = this;
		var done = function () {
			var old = btn.innerHTML;
			btn.classList.add( 'is-done' );
			btn.innerHTML = icon( 'check' );
			setTimeout( function () {
				btn.innerHTML = old;
				btn.classList.remove( 'is-done' );
			}, 1500 );
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

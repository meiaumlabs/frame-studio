=== Frame Studio — Gerador de Imagens com Moldura ===
Contributors: 61labs
Tags: imagem, moldura, redes sociais, story, instagram, whatsapp, facebook, crop
Requires at least: 5.8
Tested up to: 6.6
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Gerador de imagens 1080x1920 com moldura pronta: o usuário envia uma foto, ajusta com recorte e zoom sobre a moldura e gera a imagem para baixar e compartilhar.

== Description ==

O **Frame Studio** transforma uma moldura PNG em um gerador de imagens pronto para redes sociais.

* O administrador cadastra uma ou mais **molduras PNG** (arte com o centro transparente) no painel.
* Em qualquer página, o shortcode `[frame_studio]` exibe o editor.
* O usuário **escolhe a moldura**, **envia a foto**, **ajusta** com arrastar e zoom sobre uma prévia em tamanho real (padrão 1080x1920) e **confirma**.
* A imagem final é **gerada e salva** na biblioteca de mídia, com botões para **baixar** e **compartilhar** no Instagram, Facebook e WhatsApp (compartilhamento nativo do dispositivo quando disponível).

Visual neutro e clean, com **cor de destaque configurável**.

**Como funciona a composição**

A foto do usuário fica **atrás** e aparece pela área transparente da moldura; a arte PNG é desenhada **por cima**. Por isso a moldura deve ter exatamente a dimensão da tela configurada (padrão 1080x1920) e o centro transparente.

== Installation ==

1. Envie a pasta `frame-studio` para `/wp-content/plugins/` (ou instale o ZIP pelo painel).
2. Ative o plugin.
3. Vá em **Frame Studio** no menu do painel e cadastre pelo menos uma moldura PNG.
4. Ajuste a cor de destaque, o formato de saída e demais opções.
5. Crie uma página e insira o shortcode `[frame_studio]`.

== Frequently Asked Questions ==

= Que tipo de arquivo a moldura precisa ser? =
Um **PNG com fundo transparente** na região onde a foto deve aparecer. O ideal é que tenha exatamente a dimensão configurada (padrão 1080x1920).

= A imagem final fica salva no servidor? =
Sim. Ao confirmar, a imagem composta é enviada para a biblioteca de mídia do WordPress, gerando uma URL pública usada no compartilhamento.

= Visitantes não logados podem gerar imagens? =
Sim, por padrão. É possível restringir apenas a usuários logados nas configurações. Há também limite de tamanho de upload e controle de frequência por IP.

= Funciona no celular? =
Sim. O editor suporta arrastar e pinça para zoom, e usa o compartilhamento nativo do dispositivo (Web Share) quando disponível.

== Changelog ==

= 1.0.0 =
* Versão inicial: cadastro de molduras PNG, editor com recorte/zoom, geração 1080x1920, salvamento na biblioteca de mídia e compartilhamento (WhatsApp, Facebook, Instagram, Web Share).

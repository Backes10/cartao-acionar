"""Monta o app inteiro num unico arquivo HTML.

Para que serve: hospedagem que aceita um arquivo so, e o Artifact do Claude,
que embrulha o conteudo num <html>/<head>/<body> proprio e bloqueia qualquer
requisicao externa. O CSS, o JavaScript, os dois JSON de dados e o logo entram
todos embutidos.

    python build.py

Sai em dist/cartao-acionar.html

O que o arquivo unico NAO tem: service worker e manifest, ou seja, nao funciona
offline e nao instala como app de verdade. Para producao use a pasta completa
numa hospedagem estatica com HTTPS. Veja o README.
"""

import base64
import json
import os
import re
import shutil

RAIZ = os.path.dirname(os.path.abspath(__file__))

# O que vai para o ar. Lista explicita: publicar a pasta inteira levaria
# build.py, PLANO.md, o zip e a pasta .claude para um endereco publico.
PUBLICAVEIS = [
    'index.html',
    'app.js',
    'styles.css',
    'sw.js',
    'manifest.webmanifest',
    'data',
    'assets',   # inclui assets/seguradoras/
    'c',        # a pagina do link que o cliente recebe no WhatsApp
]

# So estes tipos saem de dentro de pastas. Ja aconteceu de dois PDFs de origem
# (o cartao antigo e o logo vetorizado) ficarem em assets/ e irem para o ar num
# endereco publico, 4,3 MB em cada deploy — provavel causa do estouro de credito
# da hospedagem. Arquivo de origem mora em fontes/, que nao e publicavel.
EXTENSOES_OK = {'.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.json',
                # a pasta c/ tem pagina propria; sao os mesmos tipos que ja saem
                # na raiz do site, entao nao afrouxam o filtro contra PDF
                '.html', '.js', '.css'}


def ler(*caminho):
    with open(os.path.join(RAIZ, *caminho), encoding='utf-8') as f:
        return f.read()


def data_uri(*caminho):
    with open(os.path.join(RAIZ, *caminho), 'rb') as f:
        return 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')


html = ler('index.html')
css = ler('styles.css')
js = ler('app.js')
produtos = json.loads(ler('data', 'produtos.json'))
seguradoras = json.loads(ler('data', 'seguradoras.json'))
logo = data_uri('assets', 'logo-acionar.png')

# Logos das seguradoras viram data URI no arquivo unico: o Artifact bloqueia
# qualquer requisicao externa, inclusive para arquivo do proprio projeto.
logos_cia = {}
dir_cia = os.path.join(RAIZ, 'assets', 'seguradoras')
if os.path.isdir(dir_cia):
    for nome in sorted(os.listdir(dir_cia)):
        if nome.lower().endswith('.png'):
            logos_cia['assets/seguradoras/' + nome] = data_uri('assets', 'seguradoras', nome)

# Só o conteúdo do <body>: o Artifact fornece o próprio esqueleto da página.
corpo = re.search(r'<body[^>]*>(.*)</body>', html, re.S).group(1)
corpo = re.sub(r'<script[^>]*src=[\'"]app\.js[\'"][^>]*>\s*</script>', '', corpo)

titulo = re.search(r'<title>(.*?)</title>', html, re.S).group(1).strip()


def sem_fechar_script(texto):
    """`</script>` dentro de string JS encerraria a tag antes da hora."""
    return texto.replace('</script>', '<\\/script>')


dados = {
    'produtos': {k: v for k, v in produtos.items() if not k.startswith('_')},
    'seguradoras': {k: v for k, v in seguradoras.items() if not k.startswith('_')},
}

# Troca o caminho do logo pelo data URI, senao o arquivo unico tenta buscar
# assets/seguradoras/*.png e o CSP do Artifact recusa.
for cia in dados['seguradoras'].get('seguradoras', []):
    if cia.get('logo') in logos_cia:
        cia['logo'] = logos_cia[cia['logo']]

partes = [
    # Precisa ser a primeira coisa do arquivo. Sem isso, servidor que nao manda
    # charset no cabecalho faz o navegador adivinhar windows-1252 e todo acento
    # vira lixo ("Cartao" saiu "CartÃ£o" no primeiro teste).
    '<meta charset="utf-8">',
    '<title>%s</title>' % titulo,
    '<style>\n%s\n</style>' % css,
    corpo.strip(),
    '<script>\nwindow.DADOS_EMBUTIDOS = %s;\nwindow.LOGO_EMBUTIDO = %s;\n</script>'
    % (sem_fechar_script(json.dumps(dados, ensure_ascii=False, separators=(',', ':'))),
       json.dumps(logo)),
    '<script>\n%s\n</script>' % sem_fechar_script(js),
]

saida_dir = os.path.join(RAIZ, 'dist')
os.makedirs(saida_dir, exist_ok=True)
saida = os.path.join(saida_dir, 'cartao-acionar.html')
with open(saida, 'w', encoding='utf-8') as f:
    f.write('\n\n'.join(partes) + '\n')

# ---- pasta limpa para publicar ----
# Sai em docs/ porque e de la que o GitHub Pages serve. Assim o site publicado
# contem SO o app: build.py, PLANO.md, README.md e fontes/ ficam no repositorio
# mas fora do ar. Foi exatamente esse tipo de vazamento que publicou dois PDFs
# de origem sem ninguem perceber.
# No Windows o antivirus e o proprio navegador seguram arquivo aberto, e o
# rmtree morria com "Acesso negado" no meio do build. Antes isso derrubava o
# build sem impedir o deploy, e ia para o ar a pasta da build anterior.
# Agora: apaga o que der, sobrescreve o resto, e falha alto se sobrar lixo.
site = os.path.join(RAIZ, 'docs')
if os.path.isdir(site):
    shutil.rmtree(site, ignore_errors=True)
os.makedirs(site, exist_ok=True)

esperados = set()
recusados = []


def permitido(caminho):
    return os.path.splitext(caminho)[1].lower() in EXTENSOES_OK


for nome in PUBLICAVEIS:
    origem = os.path.join(RAIZ, nome)
    destino = os.path.join(site, nome)
    if os.path.isdir(origem):
        for pasta, _, arquivos in os.walk(origem):
            rel_pasta = os.path.relpath(pasta, RAIZ)
            os.makedirs(os.path.join(site, rel_pasta), exist_ok=True)
            for a in arquivos:
                rel = os.path.join(rel_pasta, a).replace('\\', '/')
                if not permitido(a):
                    recusados.append(rel)
                    continue
                shutil.copy2(os.path.join(pasta, a), os.path.join(site, rel_pasta, a))
                esperados.add(rel)
    elif os.path.isfile(origem):
        shutil.copy2(origem, destino)
        esperados.add(nome)
    else:
        raise SystemExit('ERRO: %s nao existe e esta na lista de publicaveis' % nome)

for r in recusados:
    print('  fora do site (extensao nao publicavel): %s' % r)

# Sobra de build anterior nao pode ir para o ar sem ninguem ver.
sobrando = []
for pasta, _, arquivos in os.walk(site):
    for a in arquivos:
        rel = os.path.relpath(os.path.join(pasta, a), site).replace('\\', '/')
        if rel not in esperados:
            sobrando.append(rel)
if sobrando:
    raise SystemExit('ERRO: sobrou em dist/site sem estar previsto: %s' % ', '.join(sobrando))

peso = sum(os.path.getsize(os.path.join(p, a))
           for p, _, arqs in os.walk(site) for a in arqs)
# Guarda-chuva de tamanho: o site e um app de formulario com alguns logos.
# Se passar disso, algo grande entrou sem ninguem perceber.
if peso > 2 * 1024 * 1024:
    raise SystemExit('ERRO: dist/site com %.1f MB, acima do teto de 2 MB. '
                     'Confira o que entrou.' % (peso / 1024 / 1024))

# As versoes tem de bater, senao o diagnostico acusa aparelho desatualizado
# num aparelho que acabou de atualizar.
v_sw = re.search(r"VERSAO\s*=\s*'acionar-(v[\w.]+)'", ler('sw.js'))
v_app = re.search(r"VERSAO_APP\s*=\s*'(v[\w.]+)'", ler('app.js'))
v_sw = v_sw.group(1) if v_sw else '?'
v_app = v_app.group(1) if v_app else '?'
if v_sw != v_app:
    raise SystemExit('ERRO: sw.js=%s e app.js=%s divergem. O diagnostico vai acusar '
                     'aparelho desatualizado num aparelho recem-atualizado.' % (v_sw, v_app))

kb = os.path.getsize(saida) / 1024
print('gerado: %s  (%.0f KB)' % (os.path.relpath(saida, RAIZ), kb))
print('pasta do site: %s' % os.path.relpath(site, RAIZ))
print('  versao sw.js=%s  app.js=%s  %s' % (v_sw, v_app, 'ok' if v_sw == v_app else '<<< DIVERGEM'))
print('  produtos:    %d' % len(dados['produtos']['produtos']))
print('  seguradoras: %d' % len(dados['seguradoras']['seguradoras']))
print('  logo:        %.0f KB embutido' % (len(logo) * 0.75 / 1024))
# Conferencia: o Artifact fornece o esqueleto da pagina, e nada pode sobrar
# apontando para arquivo externo. Cuidado ao mexer: '<head' tambem casa com
# '<header', e 'data/produtos.json' aparece no ramo de fetch, que no arquivo
# unico e codigo morto (a mensagem de erro cita o caminho). Sao aceitaveis.
conteudo = open(saida, encoding='utf-8').read()
for proibido in ('<html', '<head>', '<body', 'src="app.js"', 'href="styles.css"',
                 'href="manifest.webmanifest"'):
    if proibido in conteudo:
        print('  ATENCAO: ainda contem %r' % proibido)
if 'fetch(' in conteudo and 'window.DADOS_EMBUTIDOS' not in conteudo:
    print('  ATENCAO: faz fetch sem os dados embutidos')

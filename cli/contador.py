#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Contador de votos por menção (@) em comentários do Instagram (CLI).

Dois modos:
  1. Votos únicos (1 voto por pessoa para cada DJ)
  2. Todos os comentários (marcações repetidas também contam)
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

# ==============================================================================
# CONFIGURAÇÃO RÁPIDA (Você pode colar o link e seu sessionid direto aqui!)
# ==============================================================================

# Cole o link do post/reel do Instagram aqui se não quiser digitar no terminal:
POST_URL_PADRAO = ""

# Opcional: Cookie 'sessionid' do Instagram para buscar todos os comentários direto pelo link.
# (Se deixar vazio, o script procura no arquivo .instagram_session, variável de ambiente
# INSTAGRAM_SESSION_ID, ou pergunta no terminal caso o Instagram exija login).
INSTAGRAM_SESSION_ID = ""

# DJs de exemplo — troque pelos @ do seu contest:
DJS_CONTEST = [
    "@nova",
    "@pulse",
    "@orbit",
]

# Incluir respostas a comentários (sub-comentários/threads) na contagem?
INCLUIR_RESPOSTAS = True

# ==============================================================================


INSTAGRAM_WEB_APP_ID = "936619743392459"
SHORTCODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
SESSION_FILE = Path(__file__).resolve().parent / ".instagram_session"


@dataclass
class Comentario:
    id: str
    username: str
    texto: str
    timestamp: Optional[int] = None
    is_reply: bool = False


@dataclass
class EstatisticasDJ:
    handle: str
    usuarios_unicos: Set[str] = field(default_factory=set)
    usuarios_unicos_exclusivos: Set[str] = field(default_factory=set)
    comentarios_com_mencao: int = 0
    total_ocorrencias_arroba: int = 0
    contagem_por_usuario: Dict[str, int] = field(default_factory=lambda: defaultdict(int))

    @property
    def votos_unicos(self) -> int:
        return len(self.usuarios_unicos)

    @property
    def votos_repetidos(self) -> int:
        return self.comentarios_com_mencao

    @property
    def media_por_usuario(self) -> float:
        if not self.usuarios_unicos:
            return 0.0
        return self.comentarios_com_mencao / len(self.usuarios_unicos)

    def top_apoiadores(self, n: int = 3) -> List[Tuple[str, int]]:
        return sorted(
            self.contagem_por_usuario.items(),
            key=lambda item: (-item[1], item[0]),
        )[:n]


def normalizar_handle(handle: str) -> str:
    limpo = handle.strip().lower()
    if not limpo.startswith("@"):
        limpo = "@" + limpo
    return limpo


def extrair_shortcode(url_ou_codigo: str) -> Optional[str]:
    texto = url_ou_codigo.strip()
    padrao = re.compile(
        r"(?:instagram\.com|instagr\.am)/(?:[A-Za-z0-9_.-]+/)?(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)",
        re.IGNORECASE,
    )
    match = padrao.search(texto)
    if match:
        return match.group(1)
    if re.fullmatch(r"[A-Za-z0-9_-]{8,15}", texto) and not Path(texto).exists():
        return texto
    return None


def shortcode_para_media_id(shortcode: str) -> str:
    media_id = 0
    for char in shortcode:
        if char not in SHORTCODE_ALPHABET:
            raise ValueError(f"Caractere inválido no shortcode: {char}")
        media_id = media_id * 64 + SHORTCODE_ALPHABET.index(char)
    return str(media_id)


def carregar_session_id(cli_session: Optional[str] = None) -> str:
    if cli_session and cli_session.strip():
        return cli_session.strip()
    if INSTAGRAM_SESSION_ID and INSTAGRAM_SESSION_ID.strip():
        return INSTAGRAM_SESSION_ID.strip()
    env_session = os.environ.get("INSTAGRAM_SESSION_ID", "").strip()
    if env_session:
        return env_session
    if SESSION_FILE.exists():
        try:
            conteudo = SESSION_FILE.read_text(encoding="utf-8").strip()
            if conteudo:
                return conteudo
        except OSError:
            pass
    return ""


def salvar_session_id(session_id: str) -> None:
    try:
        SESSION_FILE.write_text(session_id.strip() + "\n", encoding="utf-8")
    except OSError:
        pass


def criar_headers_instagram(session_id: str = "", shortcode: str = "") -> Dict[str, str]:
    referer = f"https://www.instagram.com/p/{shortcode}/" if shortcode else "https://www.instagram.com/"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "*/*",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "X-IG-App-ID": INSTAGRAM_WEB_APP_ID,
        "X-Requested-With": "XMLHttpRequest",
        "Referer": referer,
    }
    if session_id:
        session_id_decoded = urllib.parse.unquote(session_id.strip())
        headers["Cookie"] = f"sessionid={session_id_decoded};"
    return headers


def requisicao_json(url: str, headers: Dict[str, str], timeout: int = 20) -> Dict:
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        return json.loads(raw)


def buscar_respostas_comentario(
    media_id: str,
    comment_id: str,
    headers: Dict[str, str],
) -> List[Comentario]:
    respostas: List[Comentario] = []
    max_id: Optional[str] = None
    pagina = 0

    while True:
        pagina += 1
        params = {"max_id": max_id} if max_id else {}
        query = f"?{urllib.parse.urlencode(params)}" if params else ""
        url = f"https://www.instagram.com/api/v1/media/{media_id}/comments/{comment_id}/inline_child_comments/{query}"
        try:
            dados = requisicao_json(url, headers=headers)
        except Exception:
            break

        for item in dados.get("child_comments", []) or []:
            user = (item.get("user") or {}).get("username") or "desconhecido"
            texto = item.get("text") or ""
            cid = str(item.get("pk") or item.get("id") or f"reply_{comment_id}_{len(respostas)}")
            ts = item.get("created_at") or item.get("created_at_utc")
            respostas.append(
                Comentario(id=cid, username=user.lower(), texto=texto, timestamp=ts, is_reply=True)
            )

        has_more = dados.get("has_more_tail_child_comments") or dados.get("has_more_head_child_comments")
        next_max = dados.get("next_max_child_cursor") or dados.get("next_min_child_cursor")
        if not has_more or not next_max or next_max == max_id or pagina > 50:
            break
        max_id = next_max
        time.sleep(0.35)

    return respostas


def buscar_comentarios_api_v1(
    shortcode: str,
    session_id: str = "",
    incluir_respostas: bool = True,
) -> List[Comentario]:
    media_id = shortcode_para_media_id(shortcode)
    headers = criar_headers_instagram(session_id=session_id, shortcode=shortcode)
    comentarios: List[Comentario] = []
    ids_vistos: Set[str] = set()

    min_id: Optional[str] = None
    max_id: Optional[str] = None
    pagina = 0

    print(f"-> Conectando ao Instagram (Post shortcode: {shortcode} | Media ID: {media_id})...")

    while True:
        pagina += 1
        params = {
            "can_support_threading": "true",
            "permalink_enabled": "false",
        }
        if min_id:
            params["min_id"] = min_id
        elif max_id:
            params["max_id"] = max_id

        url = f"https://www.instagram.com/api/v1/media/{media_id}/comments/?{urllib.parse.urlencode(params)}"
        dados = requisicao_json(url, headers=headers)

        if dados.get("status") != "ok" and not dados.get("comments"):
            msg = dados.get("message") or "Resposta inesperada da API do Instagram."
            raise RuntimeError(msg)

        lista = dados.get("comments") or []
        novos_nesta_pagina = 0

        for item in lista:
            cid = str(item.get("pk") or item.get("id") or "")
            if not cid or cid in ids_vistos:
                continue
            ids_vistos.add(cid)
            novos_nesta_pagina += 1

            user = (item.get("user") or {}).get("username") or "desconhecido"
            texto = item.get("text") or ""
            ts = item.get("created_at") or item.get("created_at_utc")
            comentarios.append(
                Comentario(id=cid, username=user.lower(), texto=texto, timestamp=ts, is_reply=False)
            )

            # Respostas embutidas no preview
            if incluir_respostas:
                preview_children = item.get("preview_child_comments") or []
                child_count = int(item.get("child_comment_count") or 0)

                if child_count > len(preview_children) and session_id:
                    respostas_completas = buscar_respostas_comentario(media_id, cid, headers)
                    if respostas_completas:
                        for rep in respostas_completas:
                            if rep.id not in ids_vistos:
                                ids_vistos.add(rep.id)
                                comentarios.append(rep)
                        continue

                for child in preview_children:
                    rcid = str(child.get("pk") or child.get("id") or "")
                    if rcid and rcid not in ids_vistos:
                        ids_vistos.add(rcid)
                        ruser = (child.get("user") or {}).get("username") or "desconhecido"
                        rtexto = child.get("text") or ""
                        rts = child.get("created_at") or child.get("created_at_utc")
                        comentarios.append(
                            Comentario(
                                id=rcid,
                                username=ruser.lower(),
                                texto=rtexto,
                                timestamp=rts,
                                is_reply=True,
                            )
                        )

        print(f"   Página {pagina}: {len(comentarios)} comentários carregados até agora...", end="\r")

        next_min = dados.get("next_min_id")
        next_max = dados.get("next_max_id")

        if next_min and next_min != min_id and novos_nesta_pagina > 0:
            min_id = next_min
            max_id = None
        elif next_max and next_max != max_id and novos_nesta_pagina > 0:
            max_id = next_max
            min_id = None
        else:
            break

        time.sleep(0.45)

    if pagina > 0:
        print(" " * 70, end="\r")
    return comentarios


def buscar_comentarios_graphql(
    shortcode: str,
    session_id: str = "",
    incluir_respostas: bool = True,
) -> List[Comentario]:
    headers = criar_headers_instagram(session_id=session_id, shortcode=shortcode)
    comentarios: List[Comentario] = []
    ids_vistos: Set[str] = set()
    cursor: Optional[str] = None
    pagina = 0

    query_hash = "bc3296d1ce80a24b1b6e40b1e72903f5"

    while True:
        pagina += 1
        variaveis = {"shortcode": shortcode, "first": 50}
        if cursor:
            variaveis["after"] = cursor

        params = {
            "query_hash": query_hash,
            "variables": json.dumps(variaveis, separators=(",", ":")),
        }
        url = f"https://www.instagram.com/graphql/query/?{urllib.parse.urlencode(params)}"
        dados = requisicao_json(url, headers=headers)

        media = (dados.get("data") or {}).get("shortcode_media") or {}
        edge_parent = (
            media.get("edge_media_to_parent_comment")
            or media.get("edge_media_to_comment")
            or {}
        )
        edges = edge_parent.get("edges") or []
        novos = 0

        for edge in edges:
            node = edge.get("node") or {}
            cid = str(node.get("id") or "")
            if not cid or cid in ids_vistos:
                continue
            ids_vistos.add(cid)
            novos += 1
            user = (node.get("owner") or {}).get("username") or "desconhecido"
            texto = node.get("text") or ""
            ts = node.get("created_at")
            comentarios.append(
                Comentario(id=cid, username=user.lower(), texto=texto, timestamp=ts, is_reply=False)
            )

            if incluir_respostas:
                threaded = (node.get("edge_threaded_comments") or {}).get("edges") or []
                for t_edge in threaded:
                    t_node = t_edge.get("node") or {}
                    tcid = str(t_node.get("id") or "")
                    if tcid and tcid not in ids_vistos:
                        ids_vistos.add(tcid)
                        tuser = (t_node.get("owner") or {}).get("username") or "desconhecido"
                        ttexto = t_node.get("text") or ""
                        tts = t_node.get("created_at")
                        comentarios.append(
                            Comentario(
                                id=tcid,
                                username=tuser.lower(),
                                texto=ttexto,
                                timestamp=tts,
                                is_reply=True,
                            )
                        )

        print(f"   Página GraphQL {pagina}: {len(comentarios)} comentários carregados...", end="\r")

        page_info = edge_parent.get("page_info") or {}
        has_next = page_info.get("has_next_page")
        end_cursor = page_info.get("end_cursor")
        if not has_next or not end_cursor or end_cursor == cursor or novos == 0:
            break
        cursor = end_cursor
        time.sleep(0.45)

    if pagina > 0:
        print(" " * 70, end="\r")
    return comentarios


def tentar_instaloader(shortcode: str, incluir_respostas: bool = True) -> Optional[List[Comentario]]:
    try:
        import instaloader  # type: ignore
    except ImportError:
        return None

    try:
        L = instaloader.Instaloader(quiet=True)
        post = instaloader.Post.from_shortcode(L.context, shortcode)
        comentarios: List[Comentario] = []
        for idx, c in enumerate(post.get_comments()):
            comentarios.append(
                Comentario(
                    id=str(getattr(c, "id", idx)),
                    username=c.owner.username.lower(),
                    texto=c.text or "",
                    is_reply=False,
                )
            )
            if incluir_respostas and hasattr(c, "answers"):
                for r_idx, ans in enumerate(c.answers):
                    comentarios.append(
                        Comentario(
                            id=f"{getattr(c, 'id', idx)}_r_{r_idx}",
                            username=ans.owner.username.lower(),
                            texto=ans.text or "",
                            is_reply=True,
                        )
                    )
        return comentarios
    except Exception:
        return None


def ler_clipboard_macos() -> str:
    try:
        res = subprocess.run(["pbpaste"], capture_output=True, text=True, check=True)
        return res.stdout
    except Exception as exc:
        raise RuntimeError(f"Não foi possível ler a área de transferência (pbpaste): {exc}")


def parsear_conteudo_bruto(conteudo: str) -> List[Comentario]:
    conteudo_strip = conteudo.strip()
    if not conteudo_strip:
        return []

    # 1. Tenta JSON (formato do coletor-navegador.js, API do Instagram ou exportadores comuns)
    if conteudo_strip.startswith("[") or conteudo_strip.startswith("{"):
        try:
            dados = json.loads(conteudo_strip)
            return extrair_comentarios_de_json(dados)
        except json.JSONDecodeError:
            pass

    # 2. Tenta CSV se tiver cabeçalho típico
    linhas = conteudo_strip.splitlines()
    if len(linhas) >= 2 and ("," in linhas[0] or ";" in linhas[0] or "\t" in linhas[0]):
        delimitador = ";" if ";" in linhas[0] and "," not in linhas[0] else (
            "\t" if "\t" in linhas[0] else ","
        )
        try:
            leitor = csv.DictReader(linhas, delimiter=delimitador)
            if leitor.fieldnames:
                campos_lower = {c.lower().strip(): c for c in leitor.fieldnames if c}
                col_user = next(
                    (
                        campos_lower[k]
                        for k in (
                            "username",
                            "user",
                            "usuario",
                            "usuário",
                            "author",
                            "autor",
                            "ownerUsername",
                            "ownerusername",
                            "profile",
                        )
                        if k in campos_lower
                    ),
                    None,
                )
                col_text = next(
                    (
                        campos_lower[k]
                        for k in (
                            "text",
                            "texto",
                            "comment",
                            "comentario",
                            "comentário",
                            "body",
                            "message",
                        )
                        if k in campos_lower
                    ),
                    None,
                )
                if col_user and col_text:
                    comentarios_csv: List[Comentario] = []
                    for idx, row in enumerate(leitor):
                        u = (row.get(col_user) or "").strip().lstrip("@").lower()
                        t = (row.get(col_text) or "").strip()
                        if u or t:
                            comentarios_csv.append(
                                Comentario(id=f"csv_{idx}", username=u or f"anon_{idx}", texto=t)
                            )
                    if comentarios_csv:
                        return comentarios_csv
        except Exception:
            pass

    # 3. Texto livre / copiado direto da página do Instagram
    return parsear_texto_livre(linhas)


def extrair_comentarios_de_json(dados: object) -> List[Comentario]:
    comentarios: List[Comentario] = []

    if isinstance(dados, dict):
        if "comments" in dados and isinstance(dados["comments"], list):
            dados = dados["comments"]
        elif "data" in dados and isinstance(dados["data"], list):
            dados = dados["data"]

    if isinstance(dados, list):
        for idx, item in enumerate(dados):
            if not isinstance(item, dict):
                continue
            user = (
                item.get("username")
                or item.get("ownerUsername")
                or item.get("user_name")
                or item.get("author")
                or ((item.get("user") or {}).get("username") if isinstance(item.get("user"), dict) else None)
                or ((item.get("owner") or {}).get("username") if isinstance(item.get("owner"), dict) else None)
                or (item.get("user") if isinstance(item.get("user"), str) else None)
                or f"usuario_{idx}"
            )
            texto = (
                item.get("text")
                or item.get("texto")
                or item.get("comment")
                or item.get("body")
                or ""
            )
            cid = str(item.get("id") or item.get("pk") or f"json_{idx}")
            is_reply = bool(item.get("is_reply") or item.get("parent_id"))
            comentarios.append(
                Comentario(
                    id=cid,
                    username=str(user).strip().lstrip("@").lower(),
                    texto=str(texto),
                    is_reply=is_reply,
                )
            )
    return comentarios


def parsear_texto_livre(linhas: List[str]) -> List[Comentario]:
    """
    Suporta dois formatos de texto livre:
      Formato A (1 comentário por linha):
        usuario123: @nova
        @usuario456 - @pulse
        usuario789 @orbit
      Formato B (copiado e colado direto da página web do Instagram):
        Blocos onde o nome do usuário aparece antes da linha contendo o @ do DJ.
    """
    comentarios: List[Comentario] = []
    padrao_linha_unica = re.compile(
        r"^\s*@?([a-zA-Z0-9._]{2,30})\s*(?::|-|\||;|\t|\s+)\s*(.*@[a-zA-Z0-9._]+.*)$"
    )

    # Verifica se a maioria das linhas com @ segue o formato "usuario: @dj"
    linhas_com_arroba = [ln for ln in linhas if "@" in ln]
    matches_linha_unica = [ln for ln in linhas_com_arroba if padrao_linha_unica.match(ln)]

    if matches_linha_unica and len(matches_linha_unica) >= max(1, len(linhas_com_arroba) // 2):
        for idx, ln in enumerate(linhas):
            m = padrao_linha_unica.match(ln)
            if m:
                user, texto = m.group(1).lower(), m.group(2).strip()
                comentarios.append(Comentario(id=f"txt_{idx}", username=user, texto=texto))
            elif "@" in ln:
                comentarios.append(
                    Comentario(id=f"txt_{idx}", username=f"linha_{idx + 1}", texto=ln.strip())
                )
        return comentarios

    # Formato B: texto colado do Instagram Web (username em linha anterior ao comentário)
    ignorar_palavras = {
        "responder",
        "reply",
        "ver tradução",
        "see translation",
        "curtir",
        "like",
        "ocultar",
        "editado",
        "edited",
    }
    padrao_tempo = re.compile(r"^\d+\s*(s|m|min|h|d|sem|w|y|a)$", re.IGNORECASE)
    padrao_curtidas = re.compile(r"^\d+\s*(curtida|curtidas|like|likes)$", re.IGNORECASE)
    padrao_ver_respostas = re.compile(r"^ver\s+(todas\s+as\s+)?\d*\s*respostas", re.IGNORECASE)
    padrao_username_isolado = re.compile(r"^@?([a-zA-Z0-9._]{2,30})$")

    ultimo_usuario = ""
    for idx, bruta in enumerate(linhas):
        ln = bruta.strip()
        if not ln:
            continue
        ln_lower = ln.lower()
        if (
            ln_lower in ignorar_palavras
            or padrao_tempo.match(ln_lower)
            or padrao_curtidas.match(ln_lower)
            or padrao_ver_respostas.match(ln_lower)
        ):
            continue

        # Se for apenas um nome de usuário sem @ no começo (típico do cabeçalho do comentário no Instagram)
        if not ln.startswith("@") and padrao_username_isolado.match(ln) and " " not in ln:
            ultimo_usuario = ln.lower()
            continue

        if "@" in ln:
            user = ultimo_usuario if ultimo_usuario else f"comentario_{idx + 1}"
            comentarios.append(Comentario(id=f"igpaste_{idx}", username=user, texto=ln))

    return comentarios


def gerar_dados_demonstracao() -> List[Comentario]:
    """Gera dados simulados realistas de um DJ Contest para testar as 2 tabelas."""
    dados_demo = [
        ("ana.beats", "fecha com @nova"),
        ("ana.beats", "@nova sem dúvida"),
        ("ana.beats", "@nova @nova"),
        ("leo.mix", "Tem que ser @nova"),
        ("sofia.k", "@NOVA"),
        ("sofia.k", "meu voto: @nova"),
        ("rafa", "@nova"),
        ("bia.fest", "@pulse"),
        ("bia.fest", "@pulse toca muito"),
        ("caio", "@pulse"),
        ("mari", "@Pulse"),
        ("joao.v", "@pulse na line"),
        ("nanda", "@pulse"),
        ("duda", "@orbit"),
        ("duda", "@orbit"),
        ("duda", "@orbit"),
        ("theo", "@orbit"),
        ("lara", "@orbit até o fim"),
        ("mix.user", "quero @nova e @orbit"),
        ("pergunta", "que horas começa? @amigo"),
    ]
    return [
        Comentario(id=f"demo_{i}", username=u.strip(), texto=t)
        for i, (u, t) in enumerate(dados_demo, start=1)
    ]


def contabilizar_votos(
    comentarios: Iterable[Comentario],
    djs: List[str],
    ignorar_auto_voto: bool = False,
) -> Tuple[Dict[str, EstatisticasDJ], Dict[str, int]]:
    djs_normalizados = [normalizar_handle(dj) for dj in djs]
    stats: Dict[str, EstatisticasDJ] = {dj: EstatisticasDJ(handle=dj) for dj in djs_normalizados}

    # Compila regex para cada DJ garantindo que @nova não dê falso positivo em @novamente
    padroes_dj: Dict[str, re.Pattern] = {}
    for dj in djs_normalizados:
        nome_sem_arroba = re.escape(dj.lstrip("@"))
        padroes_dj[dj] = re.compile(
            rf"(?<![a-zA-Z0-9._])@{nome_sem_arroba}(?![a-zA-Z0-9._])",
            re.IGNORECASE,
        )

    total_comentarios = 0
    comentarios_com_voto_valido = 0
    usuarios_totais_participantes: Set[str] = set()
    djs_votados_por_usuario: Dict[str, Set[str]] = defaultdict(set)

    for com in comentarios:
        total_comentarios += 1
        usuario = com.username.strip().lstrip("@").lower()
        texto = com.texto or ""
        votou_neste_comentario = False

        for dj, regex in padroes_dj.items():
            ocorrencias = regex.findall(texto)
            if not ocorrencias:
                continue

            if ignorar_auto_voto and usuario == dj.lstrip("@"):
                continue

            votou_neste_comentario = True
            est = stats[dj]
            est.usuarios_unicos.add(usuario)
            est.comentarios_com_mencao += 1
            est.total_ocorrencias_arroba += len(ocorrencias)
            est.contagem_por_usuario[usuario] += 1

            usuarios_totais_participantes.add(usuario)
            djs_votados_por_usuario[usuario].add(dj)

        if votou_neste_comentario:
            comentarios_com_voto_valido += 1

    # Calcula quantos usuários votaram exclusivamente naquele DJ (não votaram em mais de um DJ)
    usuarios_multi_voto = 0
    for usuario, djs_do_usuario in djs_votados_por_usuario.items():
        if len(djs_do_usuario) == 1:
            unico_dj = next(iter(djs_do_usuario))
            stats[unico_dj].usuarios_unicos_exclusivos.add(usuario)
        elif len(djs_do_usuario) > 1:
            usuarios_multi_voto += 1

    resumo_geral = {
        "total_comentarios_lidos": total_comentarios,
        "comentarios_com_voto_valido": comentarios_com_voto_valido,
        "comentarios_sem_dj_do_contest": total_comentarios - comentarios_com_voto_valido,
        "total_usuarios_votantes": len(usuarios_totais_participantes),
        "usuarios_que_votaram_em_mais_de_um_dj": usuarios_multi_voto,
    }
    return stats, resumo_geral


def barra_progresso(valor: int, maximo: int, largura: int = 18) -> str:
    if maximo <= 0 or valor <= 0:
        return "░" * largura
    preenchido = int(round((valor / maximo) * largura))
    preenchido = max(1, min(largura, preenchido))
    return "█" * preenchido + "░" * (largura - preenchido)


def exibir_relatorio(
    stats: Dict[str, EstatisticasDJ],
    resumo: Dict[str, int],
    origem_descricao: str,
) -> None:
    largura_linha = 88
    print("\n" + "=" * largura_linha)
    print("🎧  RESULTADO DA CONTAGEM".center(largura_linha))
    print("=" * largura_linha)
    print(f"Fonte analisada : {origem_descricao}")
    print(
        f"Resumo geral    : {resumo['total_comentarios_lidos']} comentários lidos | "
        f"{resumo['comentarios_com_voto_valido']} comentários c/ voto | "
        f"{resumo['total_usuarios_votantes']} pessoas únicas votaram"
    )
    if resumo["usuarios_que_votaram_em_mais_de_um_dj"] > 0:
        print(
            f"Observação      : {resumo['usuarios_que_votaram_em_mais_de_um_dj']} pessoa(s) "
            "marcaram mais de um DJ diferente nos comentários."
        )
    print("=" * largura_linha)

    # --------------------------------------------------------------------------
    # TABELA 1: VOTOS ÚNICOS (1 VOTO POR PESSOA / SEM DUPLICATAS)
    # --------------------------------------------------------------------------
    ranking_unicos = sorted(
        stats.values(),
        key=lambda s: (-s.votos_unicos, -s.votos_repetidos, s.handle),
    )
    soma_unicos = sum(s.votos_unicos for s in ranking_unicos)
    lider_unicos = ranking_unicos[0].votos_unicos if ranking_unicos else 0

    print("\n📌 TABELA 1: VOTAÇÃO POR PESSOA ÚNICA (1 comentário/voto por usuário — SEM repetidos)")
    print("-" * largura_linha)
    print(
        f"{'Pos':<4} | {'DJ (@arroba)':<20} | {'Votos Únicos':>12} | "
        f"{'Exclusivos*':>11} | {'% Únicos':>8} | {'Dif. 1º':>8} | {'Proporção'}"
    )
    print("-" * largura_linha)

    for idx, item in enumerate(ranking_unicos, start=1):
        medalha = {1: "1º", 2: "2º", 3: "3º"}.get(idx, f"{idx}º")
        pct = (item.votos_unicos / soma_unicos * 100.0) if soma_unicos > 0 else 0.0
        dif = item.votos_unicos - lider_unicos
        dif_str = "Líder" if idx == 1 and item.votos_unicos > 0 else f"{dif:+d}"
        barra = barra_progresso(item.votos_unicos, lider_unicos, largura=14)
        print(
            f"{medalha:<4} | {item.handle:<20} | {item.votos_unicos:>12} | "
            f"{len(item.usuarios_unicos_exclusivos):>11} | {pct:>7.1f}% | {dif_str:>8} | {barra}"
        )
    print("-" * largura_linha)
    print(
        f"{'TOTAL':<27} | {soma_unicos:>12} | "
        f"{sum(len(s.usuarios_unicos_exclusivos) for s in ranking_unicos):>11} | {'100.0%':>8} |"
    )
    print("  *Exclusivos = Pessoas que votaram SOMENTE neste DJ (não marcaram os outros concorrentes).")

    # --------------------------------------------------------------------------
    # TABELA 2: VOTOS TOTAIS COM REPETIÇÃO (TODOS OS COMENTÁRIOS CONTANDO)
    # --------------------------------------------------------------------------
    ranking_repetidos = sorted(
        stats.values(),
        key=lambda s: (-s.votos_repetidos, -s.total_ocorrencias_arroba, -s.votos_unicos, s.handle),
    )
    soma_repetidos = sum(s.votos_repetidos for s in ranking_repetidos)
    soma_arrobas = sum(s.total_ocorrencias_arroba for s in ranking_repetidos)
    lider_repetidos = ranking_repetidos[0].votos_repetidos if ranking_repetidos else 0

    print("\n📌 TABELA 2: VOTAÇÃO COM COMENTÁRIOS REPETIDOS (Todas as marcações contando)")
    print("-" * largura_linha)
    print(
        f"{'Pos':<4} | {'DJ (@arroba)':<20} | {'Comentários':>12} | "
        f"{'Total @s*':>9} | {'% Total':>8} | {'Dif. 1º':>8} | {'Média/Pessoa':>12}"
    )
    print("-" * largura_linha)

    for idx, item in enumerate(ranking_repetidos, start=1):
        medalha = {1: "1º", 2: "2º", 3: "3º"}.get(idx, f"{idx}º")
        pct = (item.votos_repetidos / soma_repetidos * 100.0) if soma_repetidos > 0 else 0.0
        dif = item.votos_repetidos - lider_repetidos
        dif_str = "Líder" if idx == 1 and item.votos_repetidos > 0 else f"{dif:+d}"
        media_str = f"{item.media_por_usuario:.2f}x"
        print(
            f"{medalha:<4} | {item.handle:<20} | {item.votos_repetidos:>12} | "
            f"{item.total_ocorrencias_arroba:>9} | {pct:>7.1f}% | {dif_str:>8} | {media_str:>12}"
        )
    print("-" * largura_linha)
    print(
        f"{'TOTAL':<27} | {soma_repetidos:>12} | "
        f"{soma_arrobas:>9} | {'100.0%':>8} |"
    )
    print(
        "  *Comentários = Nº de comentários em que o DJ foi marcado | "
        "Total @s = Total de vezes que o @ apareceu (caso marquem 2x+ no mesmo comentário)."
    )

    # Top apoiadores (quem mais comentou repetidamente para cada DJ)
    print("\n🔥 TOP APOIADORES (Quem mais comentou para cada DJ):")
    for item in ranking_repetidos:
        tops = item.top_apoiadores(3)
        if not tops:
            print(f"  • {item.handle:<18}: nenhum voto registrado")
        else:
            resumo_tops = ", ".join(f"@{u} ({qtd}x)" for u, qtd in tops)
            print(f"  • {item.handle:<18}: {resumo_tops}")
    print("=" * largura_linha + "\n")


def salvar_csv_resultado(
    caminho_csv: Path,
    stats: Dict[str, EstatisticasDJ],
) -> None:
    with caminho_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "DJ",
                "Votos_Unicos_1_Por_Pessoa",
                "Votos_Unicos_Exclusivos",
                "Comentarios_Totais_Com_Repeticao",
                "Total_Mencoes_Arroba",
                "Media_Comentarios_Por_Pessoa",
            ]
        )
        for item in sorted(stats.values(), key=lambda s: -s.votos_unicos):
            writer.writerow(
                [
                    item.handle,
                    item.votos_unicos,
                    len(item.usuarios_unicos_exclusivos),
                    item.votos_repetidos,
                    item.total_ocorrencias_arroba,
                    f"{item.media_por_usuario:.2f}",
                ]
            )


def menu_fallback_interativo(shortcode: str, erro_original: str) -> List[Comentario]:
    print("\n" + "!" * 88)
    print("⚠️  O Instagram exigiu autenticação para listar todos os comentários deste post.")
    print(f"   Detalhe técnico: {erro_original}")
    print("!" * 88)
    print("\nEscolha como deseja carregar os comentários (leva menos de 30 segundos):")
    print("  [1] Usar o Coletor no Navegador (RECOMENDADO — 100% dos comentários sem bloqueio):")
    print("      1. Abra o post do Instagram no seu navegador (onde você já está logado).")
    print("      2. Aperte Cmd+Option+I (aba 'Console') e cole o conteúdo de 'cli/coletor-navegador.js'.")
    print("      3. Quando terminar, ele copia tudo sozinho! Daí volte aqui e digite 1.")
    print("  [2] Colar seu cookie 'sessionid' do Instagram (para buscar direto pelo link agora e nas próximas vezes)")
    print("  [3] Ler comentários que você já copiou para a Área de Transferência (Clipboard / Cmd+C)")
    print("  [4] Informar o caminho de um arquivo (.json, .csv ou .txt)")
    print("  [5] Rodar demonstração com dados de exemplo (para testar as tabelas)")
    print("  [0] Sair")

    while True:
        escolha = input("\nDigite sua opção (1/2/3/4/5/0): ").strip()
        if escolha in ("1", "3"):
            conteudo = ler_clipboard_macos()
            comentarios = parsear_conteudo_bruto(conteudo)
            if comentarios:
                print(f"✅ {len(comentarios)} comentários carregados da Área de Transferência!")
                return comentarios
            print("❌ Não encontrei comentários válidos na sua Área de Transferência (Cmd+C). Tente novamente.")
        elif escolha == "2":
            print("\nComo pegar o 'sessionid' no navegador:")
            print("  • No Instagram aberto no Chrome/Brave/Safari, aperte Cmd+Option+I -> aba 'Application' (ou 'Armazenamento') -> Cookies -> https://www.instagram.com")
            print("  • Copie o valor da linha 'sessionid' e cole abaixo:")
            novo_session = input("Cole o sessionid: ").strip()
            if novo_session:
                salvar_session_id(novo_session)
                print("✅ sessionid salvo em .instagram_session! Tentando buscar os comentários novamente...")
                try:
                    coms = buscar_comentarios_api_v1(
                        shortcode, session_id=novo_session, incluir_respostas=INCLUIR_RESPOSTAS
                    )
                    if coms:
                        return coms
                except Exception as e2:
                    print(f"❌ Erro na API v1 ({e2}), tentando GraphQL...")
                    try:
                        coms = buscar_comentarios_graphql(
                            shortcode, session_id=novo_session, incluir_respostas=INCLUIR_RESPOSTAS
                        )
                        if coms:
                            return coms
                    except Exception as e3:
                        print(f"❌ Ainda não foi possível buscar via API: {e3}")
        elif escolha == "4":
            caminho_str = input("Digite ou arraste o arquivo (.json, .csv, .txt) para cá: ").strip().strip("'\"")
            caminho = Path(caminho_str).expanduser()
            if caminho.exists():
                conteudo = caminho.read_text(encoding="utf-8", errors="replace")
                comentarios = parsear_conteudo_bruto(conteudo)
                if comentarios:
                    return comentarios
                print("❌ O arquivo foi lido, mas nenhum comentário foi identificado.")
            else:
                print(f"❌ Arquivo não encontrado: {caminho}")
        elif escolha == "5":
            return gerar_dados_demonstracao()
        elif escolha == "0":
            sys.exit(0)


def obter_comentarios_por_link(
    shortcode: str,
    session_id: str,
    incluir_respostas: bool,
    interativo: bool = True,
) -> List[Comentario]:
    erros: List[str] = []

    # 1. Tenta API v1 do Instagram (melhor paginação quando autenticado ou público)
    try:
        comentarios = buscar_comentarios_api_v1(
            shortcode=shortcode,
            session_id=session_id,
            incluir_respostas=incluir_respostas,
        )
        if comentarios:
            return comentarios
        erros.append("API v1 retornou lista vazia (post sem comentários ou login exigido).")
    except urllib.error.HTTPError as e:
        erros.append(f"API v1 HTTP {e.code}")
    except Exception as e:
        erros.append(f"API v1: {e}")

    # 2. Tenta GraphQL do Instagram
    try:
        comentarios = buscar_comentarios_graphql(
            shortcode=shortcode,
            session_id=session_id,
            incluir_respostas=incluir_respostas,
        )
        if comentarios:
            return comentarios
        erros.append("GraphQL retornou lista vazia.")
    except urllib.error.HTTPError as e:
        erros.append(f"GraphQL HTTP {e.code}")
    except Exception as e:
        erros.append(f"GraphQL: {e}")

    # 3. Tenta Instaloader caso esteja instalado no ambiente
    coms_insta = tentar_instaloader(shortcode, incluir_respostas=incluir_respostas)
    if coms_insta:
        return coms_insta

    resumo_erros = " | ".join(erros) if erros else "Bloqueio de leitura não autenticada do Instagram."
    if interativo and sys.stdin.isatty():
        return menu_fallback_interativo(shortcode, resumo_erros)

    raise RuntimeError(
        f"Não foi possível baixar os comentários diretamente sem autenticação ({resumo_erros}). "
        "Passe --sessionid SEU_SESSION_ID, ou use --clipboard após rodar o cli/coletor-navegador.js."
    )


def construir_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Conta votos por menção (@) nos comentários de um post do Instagram."
    )
    parser.add_argument(
        "entrada",
        nargs="?",
        default="",
        help="Link do post do Instagram, caminho de arquivo (.json/.csv/.txt), 'clipboard' ou 'demo'.",
    )
    parser.add_argument(
        "--sessionid",
        default="",
        help="Cookie 'sessionid' do Instagram para buscar todos os comentários direto pela URL.",
    )
    parser.add_argument(
        "--clipboard",
        action="store_true",
        help="Lê os comentários copiados na Área de Transferência do Mac (pbpaste).",
    )
    parser.add_argument(
        "--arquivo",
        "-f",
        default="",
        help="Lê os comentários a partir de um arquivo local (.json, .csv ou .txt).",
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Executa uma simulação com dados de exemplo para visualizar as duas tabelas.",
    )
    parser.add_argument(
        "--djs",
        nargs="+",
        default=None,
        help="Lista de @ dos DJs (padrão: @nova @pulse @orbit).",
    )
    parser.add_argument(
        "--sem-respostas",
        action="store_true",
        help="Ignora respostas a comentários (conta apenas comentários principais).",
    )
    parser.add_argument(
        "--ignorar-auto-voto",
        action="store_true",
        help="Ignora comentários feitos pelo próprio perfil do DJ votando em si mesmo.",
    )
    parser.add_argument(
        "--salvar-csv",
        default="resultado_contest.csv",
        help="Caminho do arquivo CSV para salvar o resultado (padrão: resultado_contest.csv).",
    )
    return parser


def main() -> None:
    parser = construir_parser()
    args = parser.parse_args()

    djs_alvo = args.djs if args.djs else DJS_CONTEST
    incluir_respostas = INCLUIR_RESPOSTAS and not args.sem_respostas
    session_id = carregar_session_id(args.sessionid)
    if args.sessionid:
        salvar_session_id(args.sessionid)

    entrada = args.entrada.strip() or POST_URL_PADRAO.strip()
    comentarios: List[Comentario] = []
    origem_descricao = ""

    if args.demo or entrada.lower() == "demo":
        comentarios = gerar_dados_demonstracao()
        origem_descricao = "Modo Demonstração (Dados Simulados)"
    elif args.clipboard or entrada.lower() in ("clipboard", "pbpaste", "colar"):
        conteudo = ler_clipboard_macos()
        comentarios = parsear_conteudo_bruto(conteudo)
        origem_descricao = "Área de Transferência (Clipboard do macOS)"
    elif args.arquivo:
        caminho = Path(args.arquivo).expanduser()
        if not caminho.exists():
            print(f"❌ Erro: Arquivo não encontrado: {caminho}", file=sys.stderr)
            sys.exit(1)
        comentarios = parsear_conteudo_bruto(caminho.read_text(encoding="utf-8", errors="replace"))
        origem_descricao = f"Arquivo local ({caminho.name})"
    else:
        if not entrada:
            print("=" * 72)
            print("🎧 CONTADOR DE VOTOS")
            print("=" * 72)
            print("Dica: Você também pode colar o link fixo na variável POST_URL_PADRAO dentro do contador.py.")
            entrada = input(
                "\nCole o link do post do Instagram (ou digite 'clipboard', 'demo' ou caminho de arquivo): "
            ).strip()

        if not entrada:
            print("❌ Nenhuma entrada informada. Encerrando.")
            sys.exit(1)

        if entrada.lower() == "demo":
            comentarios = gerar_dados_demonstracao()
            origem_descricao = "Modo Demonstração (Dados Simulados)"
        elif entrada.lower() in ("clipboard", "pbpaste", "colar"):
            conteudo = ler_clipboard_macos()
            comentarios = parsear_conteudo_bruto(conteudo)
            origem_descricao = "Área de Transferência (Clipboard do macOS)"
        else:
            caminho_teste = Path(entrada.strip("'\"")).expanduser()
            if caminho_teste.exists() and caminho_teste.is_file():
                comentarios = parsear_conteudo_bruto(
                    caminho_teste.read_text(encoding="utf-8", errors="replace")
                )
                origem_descricao = f"Arquivo local ({caminho_teste.name})"
            else:
                shortcode = extrair_shortcode(entrada)
                if not shortcode:
                    print(
                        f"❌ Não foi possível identificar um link/shortcode válido do Instagram em: {entrada}",
                        file=sys.stderr,
                    )
                    sys.exit(1)
                origem_descricao = f"Post do Instagram (https://www.instagram.com/p/{shortcode}/)"
                comentarios = obter_comentarios_por_link(
                    shortcode=shortcode,
                    session_id=session_id,
                    incluir_respostas=incluir_respostas,
                    interativo=True,
                )

    if not comentarios:
        print("⚠️  Nenhum comentário encontrado para processar.")
        sys.exit(1)

    stats, resumo = contabilizar_votos(
        comentarios=comentarios,
        djs=djs_alvo,
        ignorar_auto_voto=args.ignorar_auto_voto,
    )

    exibir_relatorio(stats=stats, resumo=resumo, origem_descricao=origem_descricao)

    if args.salvar_csv:
        caminho_csv = Path(args.salvar_csv)
        if not caminho_csv.is_absolute():
            caminho_csv = Path(__file__).resolve().parent / caminho_csv
        try:
            salvar_csv_resultado(caminho_csv, stats)
            print(f"💾 Tabela também salva em CSV: {caminho_csv}")
        except OSError as e:
            print(f"⚠️  Não foi possível salvar o CSV ({e}).")


if __name__ == "__main__":
    main()

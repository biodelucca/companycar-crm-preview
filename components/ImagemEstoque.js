import { jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
// Fix 2026-11-16 -- fotos do estoque quebradas no CRM.
// Causa: o site do Simples Veiculo (app.simplesveiculo.com.br) passou a
// responder as imagens com "cross-origin-resource-policy: same-origin", o que
// proibe o navegador de exibi-las dentro de outro site (o CRM). A URL em si
// continua valida (abre direto no navegador e o Apps Script a baixa normal).
// Solucao: as fotos desse dominio passam por um proxy publico de imagens
// (images.weserv.nl), que as busca no servidor e as devolve redimensionadas e
// sem a restricao. Se o proxy falhar, mostramos um quadro neutro "Sem foto" --
// escolher/associar o veiculo nunca depende da foto.
const HOST_SIMPLES = "app.simplesveiculo.com.br";
const PROXY_IMAGENS = "https://images.weserv.nl/";
export function urlImagemEstoque(url, largura = 160, altura = 120) {
    if (!url)
        return null;
    let u;
    try {
        u = new URL(String(url));
    }
    catch {
        return null;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:")
        return null;
    if (u.hostname !== HOST_SIMPLES)
        return u.href; // outros hosts: URL original, sem proxy
    const alvo = u.host + u.pathname + u.search;
    return `${PROXY_IMAGENS}?url=${encodeURIComponent(alvo)}&w=${largura}&h=${altura}&fit=cover&output=jpg&q=80`;
}
export function ImagemEstoque({ src, alt, className, largura = 160, altura = 120 }) {
    const [falhouSrc, setFalhouSrc] = useState(null);
    const url = urlImagemEstoque(src, largura, altura);
    if (!url || falhouSrc === url) {
        return _jsx("div", { className: `estoque-sem-foto${className ? " " + className : ""}`, role: "img", "aria-label": alt ?? "Sem foto", children: "Sem foto" });
    }
    return _jsx("img", { className: className, src: url, alt: alt, loading: "lazy", decoding: "async", referrerPolicy: "no-referrer", onError: () => setFalhouSrc(url) });
}

// /api/crear-pago.js
// Función serverless (Vercel) que crea una orden de pago en Flow.cl
// y devuelve la URL de checkout a la que debe ir el cliente.
//
// Variables de entorno necesarias (configurar en Vercel > Settings > Environment Variables):
//   FLOW_API_KEY      -> tu apiKey de Flow
//   FLOW_SECRET_KEY   -> tu secretKey de Flow (nunca se expone al navegador)
//   FLOW_BASE_URL     -> https://sandbox.flow.cl/api  (pruebas)  o  https://www.flow.cl/api  (real)
//   SITE_URL          -> ej: https://flores-amarillas.vercel.app  (tu dominio en Vercel, sin barra final)
//   APPS_SCRIPT_URL   -> la misma URL /exec de tu Google Apps Script

const crypto = require("crypto");

function firmarParametros(params, secretKey) {
  const claves = Object.keys(params).sort();
  const cadena = claves.map((k) => `${k}${params[k]}`).join("");
  return crypto.createHmac("sha256", secretKey).update(cadena).digest("hex");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { codigo, monto, nombreProducto, email } = req.body || {};

  if (!codigo || !monto) {
    return res.status(400).json({ error: "Faltan datos del pedido (codigo o monto)." });
  }

  const FLOW_API_KEY = process.env.FLOW_API_KEY;
  const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY;
  const FLOW_BASE_URL = process.env.FLOW_BASE_URL || "https://sandbox.flow.cl/api";
  const SITE_URL = process.env.SITE_URL;

  if (!FLOW_API_KEY || !FLOW_SECRET_KEY || !SITE_URL) {
    return res.status(500).json({ error: "Faltan variables de entorno en el servidor (FLOW_API_KEY, FLOW_SECRET_KEY o SITE_URL)." });
  }

  const params = {
    apiKey: FLOW_API_KEY,
    commerceOrder: codigo,
    subject: (nombreProducto || "Ramo Flores Amarillas").slice(0, 45).replace(/[&+"]/g, ""),
    currency: "CLP",
    amount: Math.round(monto),
    email: email || "sin-correo@floresamarillas.cl",
    urlConfirmation: `${SITE_URL}/api/confirmar-pago`,
    urlReturn: `${SITE_URL}/gracias.html?codigo=${encodeURIComponent(codigo)}`
  };

  params.s = firmarParametros(params, FLOW_SECRET_KEY);

  try {
    const flowRes = await fetch(`${FLOW_BASE_URL}/payment/create`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params)
    });

    const data = await flowRes.json();

    if (data.url && data.token) {
      return res.status(200).json({ redirectUrl: `${data.url}?token=${data.token}` });
    }

    return res.status(500).json({ error: "Flow no devolvió un link de pago.", detalle: data });
  } catch (err) {
    return res.status(500).json({ error: "Error creando el pago en Flow.", detalle: err.message });
  }
};

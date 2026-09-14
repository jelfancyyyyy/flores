// /api/confirmar-pago.js
// Flow llama a esta URL automáticamente cuando el estado de un pago cambia
// (parámetro urlConfirmation al crear el pago). Aquí verificamos el estado
// real contra Flow y, si está pagado, le avisamos a Google Sheets.
//
// Variables de entorno necesarias (además de las de crear-pago.js):
//   APPS_SCRIPT_URL -> la URL /exec de tu Google Apps Script

const crypto = require("crypto");

function firmarParametros(params, secretKey) {
  const claves = Object.keys(params).sort();
  const cadena = claves.map((k) => `${k}${params[k]}`).join("");
  return crypto.createHmac("sha256", secretKey).update(cadena).digest("hex");
}

module.exports = async (req, res) => {
  const token = req.body && req.body.token;

  if (!token) {
    return res.status(400).send("Falta token");
  }

  const FLOW_API_KEY = process.env.FLOW_API_KEY;
  const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY;
  const FLOW_BASE_URL = process.env.FLOW_BASE_URL || "https://sandbox.flow.cl/api";
  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

  const params = { apiKey: FLOW_API_KEY, token };
  params.s = firmarParametros(params, FLOW_SECRET_KEY);
  const query = new URLSearchParams(params).toString();

  try {
    const estadoRes = await fetch(`${FLOW_BASE_URL}/payment/getStatus?${query}`);
    const estado = await estadoRes.json();

    // Según la documentación de Flow: status 2 = pagada, 1 = pendiente, 3 = rechazada, 4 = anulada
    if (estado.status === 2) {
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          accion: "actualizarEstado",
          codigo: estado.commerceOrder,
          estado: "Pagado"
        })
      });
    } else if (estado.status === 3 || estado.status === 4) {
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          accion: "actualizarEstado",
          codigo: estado.commerceOrder,
          estado: "Rechazado"
        })
      });
    }

    // Flow solo necesita una respuesta 200 para dejar de reintentar.
    res.status(200).send("OK");
  } catch (err) {
    console.error("Error confirmando pago:", err);
    res.status(500).send("Error");
  }
};

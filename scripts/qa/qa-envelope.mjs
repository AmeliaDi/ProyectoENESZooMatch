// ADR-040: todo lo que cuelga de /api/chat y /api/interest responde
// {ok:true,data} o {ok:false,error:{codigo,...}}; el resto del API sigue con
// DTOs desnudos. El harness lee las dos formas para no volver a quedarse ciego
// cuando una ruta migrada cambie de contrato.
export function unwrap(body) {
  if (body && typeof body === "object" && body.ok === true && "data" in body) return body.data;
  return body;
}

// Acepta la promesa del fetch para que la lectura se escriba como las demás:
// `await readData(post(...))` en lugar de `await (await post(...)).json()`.
export async function readData(response) {
  return unwrap(await (await response).json());
}

export async function readError(response) {
  const body = await (await response).json();
  if (body && typeof body === "object" && body.ok === false && body.error) return body.error;
  return body;
}

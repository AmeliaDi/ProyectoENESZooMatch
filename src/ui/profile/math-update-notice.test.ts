/**
 * Reglas del aviso (B9): una sola vez por cambio real, nunca a quien llega por
 * primera vez, y nunca se re-pregunta lo que sigue siendo válido.
 */
import { describe, expect, it } from "vitest";

import type { ProfileDto } from "@/contracts/profile";

import { MATH_NOTICE_COPY, noticeFor } from "./math-update-notice";

const SEAL = "2.1.0+2.1.0+abcdef012345";
const MEDICION_VIGENTE: ProfileDto["measurement"] = { stamped: true, current: true, seal: SEAL };

describe("aviso de la nueva matemática", () => {
  it("no se muestra a quien entra por primera vez", () => {
    expect(noticeFor({ firm: "firma-nueva", seenFirm: null, dismissedSeal: null, measurement: MEDICION_VIGENTE })).toBeNull();
  });

  it("avisa del recálculo silencioso cuando cambió la mitad de puntaje", () => {
    expect(
      noticeFor({ firm: "firma-nueva", seenFirm: "firma-vieja", dismissedSeal: null, measurement: MEDICION_VIGENTE }),
    ).toBe("recomputed");
  });

  it("prefiere la invitación a afinar cuando cambió la medición", () => {
    const stale: ProfileDto["measurement"] = { stamped: true, current: false, seal: SEAL };
    expect(noticeFor({ firm: "firma-nueva", seenFirm: "firma-vieja", dismissedSeal: null, measurement: stale })).toBe(
      "refine",
    );
  });

  it("un perfil anterior al sello no recibe invitación: no se sabe que algo haya cambiado", () => {
    const preStamp: ProfileDto["measurement"] = { stamped: false, current: false, seal: SEAL };
    expect(noticeFor({ firm: "f", seenFirm: "f", dismissedSeal: null, measurement: preStamp })).toBeNull();
  });

  it("«Ahora no» calla el aviso hasta el siguiente cambio real", () => {
    const stale: ProfileDto["measurement"] = { stamped: true, current: false, seal: SEAL };
    expect(noticeFor({ firm: "f", seenFirm: "f", dismissedSeal: SEAL, measurement: stale })).toBeNull();
    const siguiente: ProfileDto["measurement"] = { stamped: true, current: false, seal: "2.2.0+2.2.0+111111111111" };
    expect(noticeFor({ firm: "f", seenFirm: "f", dismissedSeal: SEAL, measurement: siguiente })).toBe("refine");
  });

  it("el aviso corto no promete nada y el largo no pasa de dos frases", () => {
    expect(MATH_NOTICE_COPY.recomputed.length).toBeLessThan(200);
    expect(MATH_NOTICE_COPY.refineBody.length).toBeLessThan(200);
    expect(MATH_NOTICE_COPY.refineTitle.split(" ")).toHaveLength(3);
    for (const text of Object.values(MATH_NOTICE_COPY)) {
      expect(text).not.toMatch(/vas a encontrar|ahora sí|mejoramos tus matches|garantiz/i);
    }
  });
});

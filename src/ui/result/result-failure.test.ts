import { describe, expect, it } from "vitest";

import { classifyResultFailure } from "./result-failure";

describe("classifyResultFailure", () => {
  it("trata un 401 como sesión cerrada", () => {
    expect(classifyResultFailure(401, { code: "auth.unauthorized" })).toBe("session");
  });

  it("trata el 404 del cuestionario como quiz pendiente, no como red", () => {
    expect(classifyResultFailure(404, { code: "quiz.not_completed" })).toBe("quiz");
  });

  it("cualquier otro 404 sigue siendo genérico", () => {
    expect(classifyResultFailure(404, { code: "request.unknown_route" })).toBe("generic");
    expect(classifyResultFailure(404, null)).toBe("generic");
  });

  it("un 404 con cuerpo no-objeto es genérico", () => {
    expect(classifyResultFailure(404, [])).toBe("generic");
    expect(classifyResultFailure(404, "quiz.not_completed")).toBe("generic");
  });

  it("los fallos de servicio y de red son genéricos", () => {
    expect(classifyResultFailure(503, { code: "service.unavailable" })).toBe("generic");
    expect(classifyResultFailure(503, { code: "match.pool_unstable" })).toBe("generic");
    expect(classifyResultFailure(500, null)).toBe("generic");
    expect(classifyResultFailure(0, null)).toBe("generic");
  });
});

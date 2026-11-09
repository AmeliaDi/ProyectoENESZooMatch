import type {
  AdminAuditAction,
  AdminCounterKey,
  AdminOrder,
  AdminUserAction,
  AdminUserFilter,
  ReportStatus,
} from "@/contracts/admin";
import type { ReportReason } from "@/contracts/chat";

export const ADMIN_COPY = {
  loginTitle: "Acceso al observatorio",
  loginMatricula: "Matrícula / número de cuenta UNAM",
  loginPin: "PIN administrativo",
  loginNote: "Ventana solo para administración. El rol y el PIN se verifican en el servidor; cada acceso queda en la auditoría.",
  loginInvalid: "No pudimos verificar el acceso administrativo.",
  loginUnavailable: "El servicio de acceso no está disponible en este momento.",
  enter: "Entrar",
  verifying: "Verificando",
  logout: "Salir",
  plate: "Observatorio · administración",
  tabsLabel: "Secciones del observatorio",
  searchLabel: "Buscar por alias",
  searchHint: "Las matrículas no se guardan en claro: solo se busca por alias.",
  facetsLegend: "Filtrar por",
  facetsReset: "Quitar filtros",
  noUsers: "Sin cuentas que coincidan.",
  prev: "Anterior",
  next: "Siguiente",
  details: "Ver detalle",
  readError: "Lectura interrumpida. Intenta de nuevo.",
  actionDone: "Acción registrada en la auditoría.",
  actionPending: "Acción registrada; las afinidades se recalcularán en el siguiente intento.",
  confirmPrompt: "Para confirmar, escribe",
  cancel: "Cancelar",
  noReports: "Sin reportes en este estado.",
  noAudit: "Aún no hay acciones registradas.",
  snapshot: "Instantánea mínima",
  emptySnapshot: "Sin mensajes en la instantánea.",
  adminBadge: "admin",
  noAlias: "sin alias",
  /** A person without a frozen identity: named by the formatter, never guessed. */
  eggBadge: "huevo",
  insideEgg: "En el cascarón",
  noTypology: "Sin lectura de tipos",
} as const;

export const TAB_LABELS = {
  metrics: "Agregados",
  users: "Personas",
  reports: "Reportes",
  audit: "Auditoría",
} as const;
export type AdminTab = keyof typeof TAB_LABELS;

interface ActionCopy {
  label: string;
  body: string;
  /** Word to type before a destructive action runs; `null` = single click. */
  confirmWord: string | null;
}

export const USER_ACTION_COPY: Record<AdminUserAction, ActionCopy> = {
  reset_quiz: {
    label: "Reiniciar cuestionario",
    body: "Borra respuestas, lectura y afinidades. La identidad fijada al eclosionar, los chats y el PIN se conservan.",
    confirmWord: "REINICIAR",
  },
  pause: { label: "Pausar perfil", body: "Sale del cielo hasta que se reactive. Sus datos se conservan.", confirmWord: null },
  resume: { label: "Reactivar perfil", body: "Vuelve a participar en las afinidades.", confirmWord: null },
  reset_chat_pin: {
    label: "Restablecer PIN de chats",
    body: "La persona creará un PIN nuevo al abrir sus chats. Los mensajes no se tocan.",
    confirmWord: "PIN",
  },
  delete: {
    label: "Borrar cuenta",
    body: "Elimina la cuenta y todo lo asociado: respuestas, afinidades, chats y reportes. No se puede deshacer.",
    confirmWord: "BORRAR",
  },
};

export const AUDIT_LABELS: Record<AdminAuditAction, string> = {
  login: "Entró al observatorio",
  login_failed: "PIN administrativo incorrecto",
  logout: "Salió del observatorio",
  delete_user: "Borró una cuenta",
  reset_quiz: "Reinició un cuestionario",
  pause_user: "Pausó un perfil",
  resume_user: "Reactivó un perfil",
  reset_chat_pin: "Restableció un PIN de chats",
  recompute: "Recalculó afinidades",
  report_revisado: "Marcó un reporte como revisado",
  report_cerrado: "Cerró un reporte",
  counter_update: "Movió un contador manual",
};

/**
 * The tallies the base cannot compute: relationships nobody verifies with a
 * query, only with what the two people say. Keys come from
 * `ADMIN_COUNTER_KEYS`, so a new tally in the base without a word here is a
 * type error, not an empty panel.
 */
export const COUNTER_COPY: Record<AdminCounterKey, { label: string; body: string }> = {
  ligues: { label: "Ligues", body: "Parejas que se reconocieron como ligues, dicho por ellas." },
  novios: { label: "Novios", body: "Parejas que se reconocieron como novios, dicho por ellas." },
};

/** Word that unlocks an exact correction; a ±1 step can be stepped back, so it needs none. */
export const COUNTER_CONFIRM_WORD = "CORREGIR";

/**
 * A correction is only runnable as a whole number the base will accept: the
 * stored column clamps at zero and caps at 100 000, so anything else the
 * panel must not offer as a button.
 */
export function correctionValue(typed: string): number | null {
  const value = Number(typed.trim());
  return /^\d+$/.test(typed.trim()) && value >= 0 && value <= 100_000 ? value : null;
}

/**
 * Facet selects of the people list. `todos` is the absence of a filter, so it
 * never travels; every other value must be one the contract accepts, because
 * the route drops the whole filter — not just the bad facet — when a single
 * value fails to parse. `users-filter.test.ts` checks each one against
 * `adminUserFilterSchema`.
 */
export interface FacetSelect {
  key: keyof AdminUserFilter;
  label: string;
  options: readonly { value: string; label: string }[];
}

export const FACET_SELECTS = [
  {
    key: "estado",
    label: "Identidad",
    options: [
      { value: "todos", label: "Todas" },
      { value: "huevo", label: "En el cascarón" },
      { value: "eclosionado", label: "Con identidad fijada" },
    ],
  },
  {
    key: "pausado",
    label: "Perfil",
    options: [
      { value: "todos", label: "Activas y pausadas" },
      { value: "si", label: "Solo pausadas" },
      { value: "no", label: "Solo activas" },
    ],
  },
  {
    key: "sinAfinidad",
    label: "Sin afinidad de",
    options: [
      { value: "todos", label: "Cualquiera" },
      { value: "romance", label: "Romance" },
      { value: "amistad", label: "Amistad" },
    ],
  },
  {
    key: "soloAdmin",
    label: "Rol",
    options: [
      { value: "todos", label: "Todas las cuentas" },
      { value: "si", label: "Solo cuentas admin" },
    ],
  },
] as const satisfies readonly FacetSelect[];

/** One facet is worth naming; several are a count, not a list of words. */
export function facetsActive(count: number): string {
  return count === 1 ? "1 filtro activo" : `${count} filtros activos`;
}

/** What each whitelisted order does to the list; the SQL owns the meaning. */
export const ORDEN_LABELS: Record<AdminOrder, string> = {
  recientes: "Altas más recientes",
  antiguas: "Altas más antiguas",
  masAfinidades: "Más afinidades primero",
  menosAfinidades: "Menos afinidades primero",
  nombre: "Alias de la A a la Z",
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  abierto: "Abiertos",
  revisado: "Revisados",
  cerrado: "Cerrados",
};

export const ADMIN_REASON_LABELS: Record<ReportReason, string> = {
  acoso: "Acoso",
  ofensivo: "Lenguaje ofensivo",
  datos_personales: "Datos personales",
  spam: "Spam",
  menor_de_edad: "Posible menor de edad",
  otro: "Otro motivo",
};

/** `2026-11-03 20:41 UTC`, or a dash for a missing date. */
export function stamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Destructive actions run only when the typed word matches exactly. */
export function confirmMatches(action: AdminUserAction, typed: string): boolean {
  const word = USER_ACTION_COPY[action].confirmWord;
  return word === null || typed.trim() === word;
}

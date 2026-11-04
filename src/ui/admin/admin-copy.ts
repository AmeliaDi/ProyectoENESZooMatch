import type { AdminAuditAction, AdminUserAction, ReportStatus } from "@/contracts/admin";
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
    body: "Borra respuestas, lectura, animalito y afinidades. El alias, los chats y el PIN se conservan.",
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

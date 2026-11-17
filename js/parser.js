/**
 * Parser tolerante de XML de incidencias.
 *
 * Replica el comportamiento del script original (incidencias_basico.py):
 *  - detecta el campo de fecha aunque el XML use otro nombre
 *  - descarta fechas vacías, imposibles o futuras
 *  - descarta registros sin información útil
 *  - deduce la marca del equipo según el tipo (portátil / sobremesa)
 *
 * Además normaliza valores, marca duplicados y calcula metadatos.
 */
import { isBlank, normKey, normVal, todayISO, isoOf } from './util.js';

const MONTHS = {
  ene: 0, enero: 0, jan: 0, january: 0,
  feb: 1, febrero: 1, february: 1,
  mar: 2, marzo: 2, march: 2,
  abr: 3, abril: 3, apr: 3, april: 3,
  may: 4, mayo: 4,
  jun: 5, junio: 5, june: 5,
  jul: 6, julio: 6, july: 6,
  ago: 7, agosto: 7, aug: 7, august: 7,
  sep: 8, sept: 8, septiembre: 8, september: 8,
  oct: 9, octubre: 9, october: 9,
  nov: 10, noviembre: 10, november: 10,
  dic: 11, diciembre: 11, dec: 11, december: 11
};

/* ------------------------------------------------------------------ */
/* Fechas                                                              */
/* ------------------------------------------------------------------ */

const pad2 = (n) => String(n).padStart(2, '0');

/** Construye una fecha validando que exista de verdad (rechaza 31/02). */
function makeDate(year, month, day) {
  let y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (String(year).length <= 2) y += y < 70 ? 2000 : 1900;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return { date, iso: `${y}-${pad2(m)}-${pad2(d)}` };
}

/**
 * Interpreta la mayoría de formatos de fecha razonables.
 * @param {string} raw
 * @returns {{ok: true, iso: string, date: Date, imprecise?: boolean} | {ok: false, reason: 'empty'|'invalid', raw: string}}
 */
export function parseDateValue(raw) {
  const original = String(raw ?? '').trim();
  if (!original) return { ok: false, reason: 'empty', raw: original };

  // Limpia horas ("2025-07-21 17:26:00", "2025-07-21T17:26:00.000Z")
  let text = original
    .replace(/\s+/g, ' ')
    .replace(/(\d)[hH]\s*$/, '$1')
    .trim();

  const timeStripped = text.replace(/[ T]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/i, '').trim();
  if (timeStripped && timeStripped !== text) text = timeStripped;

  let m;

  // ISO: 2025-07-21
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text))) {
    const date = makeDate(m[1], m[2], m[3]);
    return date ? { ok: true, ...date } : { ok: false, reason: 'invalid', raw: original };
  }

  // dd/mm/yyyy · dd-mm-yyyy · dd.mm.yyyy (también mm/dd/yyyy si es imposible d/m)
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(text))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let day = a;
    let month = b;
    if (a <= 12 && b > 12) { day = b; month = a; } // formato US
    const date = makeDate(m[3], month, day);
    return date ? { ok: true, ...date } : { ok: false, reason: 'invalid', raw: original };
  }

  // 13 oct 2025 · 13 de octubre de 2025
  if ((m = /^(\d{1,2})\s*(?:de\s+)?([a-záéíóúñ]{3,12})\.?\s*(?:de\s+|,\s*)?(\d{2,4})$/i.exec(text))) {
    const month = MONTHS[normVal(m[2])];
    if (month !== undefined) {
      const date = makeDate(m[3], month + 1, m[1]);
      if (date) return { ok: true, ...date };
    }
  }

  // Oct 13, 2025 · October 13 2025
  if ((m = /^([a-záéíóúñ]{3,12})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})$/i.exec(text))) {
    const month = MONTHS[normVal(m[1])];
    if (month !== undefined) {
      const date = makeDate(m[3], month + 1, m[2]);
      if (date) return { ok: true, ...date };
    }
  }

  // Sólo año: 2025 (el script también lo acepta)
  if ((m = /^(\d{4})$/.exec(text))) {
    const date = makeDate(m[1], 1, 1);
    return date ? { ok: true, ...date, imprecise: true } : { ok: false, reason: 'invalid', raw: original };
  }

  return { ok: false, reason: 'invalid', raw: original };
}

/* ------------------------------------------------------------------ */
/* Detección de campos                                                 */
/* ------------------------------------------------------------------ */

const ROLE_RULES = [
  {
    role: 'cierre',
    label: 'Fecha de cierre',
    keys: ['fecha_cierre', 'fechacierre', 'fecha_de_cierre', 'fecha_resolucion', 'fecha_de_resolucion',
      'fecha_resuelto', 'closed_at', 'closed', 'resolved_at', 'fecha_fin', 'data_cierre', 'data_tancament']
  },
  {
    role: 'fecha',
    label: 'Fecha de incidencia',
    keys: ['fecha_de_incidencia', 'fecha_incidencia', 'fecha_de_alta', 'fecha_alta', 'fecha_creacion',
      'fecha_de_creacion', 'created_at', 'marca_temporal', 'timestamp', 'data_incidencia', 'data_obertura',
      'fecha', 'date', 'data', 'dia', 'mes']
  },
  {
    role: 'id',
    label: 'Identificador',
    keys: ['id', 'id_incidencia', 'incidencia_id', 'codigo', 'code', 'ticket', 'num_ticket', 'numero',
      'num', 'referencia', 'ref', 'id_ticket']
  },
  {
    role: 'tipo',
    label: 'Tipo de incidencia',
    keys: ['tipo_de_incidencia', 'tipo_incidencia', 'tipologia', 'tipus_incidencia', 'tipo',
      'categoria_incidencia', 'clase_incidencia', 'type', 'incident_type']
  },
  {
    role: 'equipo',
    label: 'Tipo de equipo',
    keys: ['tipo_de_equipo', 'tipo_equipo', 'tipus_equip', 'equipo', 'dispositivo', 'tipo_dispositivo',
      'device_type', 'device', 'maquina', 'hardware']
  },
  {
    role: 'clase',
    label: 'Clases',
    keys: ['clases', 'clase', 'subclase', 'subcategoria', 'categoria_clase', 'area', 'ambito']
  },
  {
    role: 'prioridad',
    label: 'Prioridad',
    keys: ['prioridad', 'prioridad_incidencia', 'priority', 'urgencia', 'severidad', 'severity']
  },
  {
    role: 'estado',
    label: 'Estado',
    keys: ['estado', 'estat', 'status', 'situacion', 'state', 'estado_incidencia']
  },
  {
    role: 'tecnico',
    label: 'Técnico',
    keys: ['tecnico', 'tecnica', 'tecnico_asignado', 'asignado', 'assigned_to', 'agent', 'agente', 'responsable']
  },
  {
    role: 'ubicacion',
    label: 'Ubicación',
    keys: ['ubicacion', 'localizacion', 'location', 'sede', 'centro', 'emplazamiento', 'planta', 'edificio', 'oficina']
  },
  {
    role: 'descripcion',
    label: 'Descripción',
    keys: ['descripcion', 'description', 'detalle', 'detalles', 'observaciones', 'comentario', 'comentarios',
      'motivo', 'resumen', 'notas', 'explicacion']
  },
  {
    role: 'horas',
    label: 'Horas de resolución',
    keys: ['horas_resolucion', 'horas_de_resolucion', 'horas', 'tiempo_resolucion', 'duracion',
      'tiempo', 'sla_horas', 'hours']
  },
  {
    role: 'origen',
    label: 'Origen',
    keys: ['origen', 'canal', 'source', 'medio', 'via', 'canal_entrada']
  },
  {
    role: 'usuario',
    label: 'Usuario',
    keys: ['usuario', 'user', 'solicitante', 'empleado', 'cliente', 'persona']
  },
  {
    role: 'coste',
    label: 'Coste',
    keys: ['coste', 'cost', 'importe', 'precio', 'price']
  }
];

const ROLE_LABELS = Object.fromEntries(ROLE_RULES.map((r) => [r.role, r.label]));

/** Decide el rol de una etiqueta XML. */
export function roleOfTag(tag) {
  const key = normKey(tag);
  if (!key) return null;

  // Los "modelo" se tratan aparte porque pueden repetirse
  if (key === 'modelo' || key.startsWith('modelo_') || key.endsWith('_modelo') ||
      key === 'model' || key === 'modelo_equipo' || key === 'marca_modelo') {
    return 'modelo';
  }

  for (const rule of ROLE_RULES) {
    if (rule.keys.includes(key)) return rule.role;
  }

  // Coincidencias parciales razonables para XMLs con nombres raros
  if (key.includes('cierre') && key.includes('fecha')) return 'cierre';
  if (key.includes('modelo') || key.includes('model')) return 'modelo';
  if (key.includes('priorid') || key.includes('urgenc')) return 'prioridad';
  if (key.includes('incidencia') && key.includes('tip')) return 'tipo';
  if (key.includes('equipo') || key.includes('dispositi')) return 'equipo';
  if (key.includes('fecha') || key.includes('date') || key === 'data' || key.startsWith('data_') ||
      key.includes('marca_temporal') || key.includes('timestamp')) return 'fecha';
  if (key.includes('tecnico') || key.includes('assign')) return 'tecnico';
  if (key.includes('ubicacion') || key.includes('sede') || key.includes('localiza')) return 'ubicacion';
  if (key.includes('descrip') || key.includes('detalle') || key.includes('coment')) return 'descripcion';
  if (key.includes('estado') || key.includes('status')) return 'estado';
  if (key.includes('clase') || key.includes('categoria')) return 'clase';
  if (key === 'id' || key.endsWith('_id')) return 'id';
  return null;
}

/* ------------------------------------------------------------------ */
/* Normalización de valores                                            */
/* ------------------------------------------------------------------ */

const EQUIPO_PORT = /(port[aá]t|portat|port[aá]b|portab|laptop|notebook|macbook|ultrabook|chromebook|thinkpad|surface)/;
const EQUIPO_DESK = /(sobremesa|desktop|torre|workstation|all.?in.?one|\baio\b|mini.?pc|imac|optiplex|thinkcentre|prodesk)/;

/** Clasifica el equipo: portátil, sobremesa u otro. */
export function equipoKind(raw) {
  const v = normVal(raw);
  if (!v) return 'otro';
  if (EQUIPO_PORT.test(v)) return 'portatil';
  if (EQUIPO_DESK.test(v)) return 'sobremesa';
  return 'otro';
}

const PRIO_MAP = new Map([
  ['critica', 'Crítica'], ['crítica', 'Crítica'], ['critic', 'Crítica'], ['urgente', 'Crítica'],
  ['urgent', 'Crítica'], ['p1', 'Crítica'], ['s1', 'Crítica'], ['muy alta', 'Crítica'], ['inmediata', 'Crítica'],
  ['alta', 'Alta'], ['high', 'Alta'], ['p2', 'Alta'], ['s2', 'Alta'],
  ['media', 'Media'], ['medium', 'Media'], ['normal', 'Media'], ['p3', 'Media'], ['s3', 'Media'], ['moderada', 'Media'],
  ['baja', 'Baja'], ['low', 'Baja'], ['p4', 'Baja'], ['s4', 'Baja'], ['menor', 'Baja']
]);

function normalizePrioridad(raw) {
  const v = normVal(raw);
  if (!v || isBlank(raw)) return '';
  return PRIO_MAP.get(v) || raw.trim();
}

function normalizeEquipo(raw) {
  const kind = equipoKind(raw);
  if (kind === 'portatil') return 'Portátil';
  if (kind === 'sobremesa') return 'Sobremesa';
  return raw.trim();
}

function cleanText(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw).replace(/\s+/g, ' ').trim();
}

function canonicalEstado(raw) {
  const s = cleanText(raw);
  if (!s || isBlank(s)) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function numeric(raw) {
  const s = String(raw ?? '').replace(',', '.').replace(/[^\d.-]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ */
/* Lectura del DOM (sólo APIs nivel 1: funciona en navegador y en tests) */
/* ------------------------------------------------------------------ */

function elementChildren(el) {
  const out = [];
  if (!el || !el.childNodes) return out;
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i];
    if (node.nodeType === 1) out.push(node);
  }
  return out;
}

export function tagName(el) {
  return (el.localName || el.nodeName || '').replace(/^.*:/, '');
}

function textOf(el) {
  if (!el) return '';
  if (el.textContent !== undefined && el.textContent !== null) return el.textContent;
  let out = '';
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i];
    if (node.nodeType === 3 || node.nodeType === 4) out += node.nodeValue;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Parseo principal                                                    */
/* ------------------------------------------------------------------ */

/**
 * @param {string} xmlText contenido del archivo
 * @param {{filename?: string, size?: number}} meta
 */
export function parseDataset(rawXmlText, meta = {}) {
  const warnings = [];
  const xmlText = String(rawXmlText).replace(/^\uFEFF/, '');
  let doc;
  try {
    doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  } catch {
    throw new Error('El navegador no ha podido leer el XML.');
  }

  const errNode = (typeof doc.querySelector === 'function' ? doc.querySelector('parsererror') : null) ||
    doc.getElementsByTagName('parsererror')[0];
  if (errNode || (doc.documentElement && /parsererror/i.test(doc.documentElement.nodeName))) {
    const detail = (errNode?.textContent || doc.documentElement?.textContent || '')
      .replace(/\s+/g, ' ').trim().slice(0, 240);
    throw new Error(`XML no válido${detail ? `: ${detail}` : '.'}`);
  }

  const root = doc.documentElement;
  if (!root) throw new Error('El XML está vacío.');

  const rootChildren = elementChildren(root);
  if (!rootChildren.length) {
    throw new Error(`El nodo raíz <${tagName(root)}> no contiene registros.`);
  }

  // Localiza el contenedor real de registros (admite un wrapper intermedio).
  let records = rootChildren;
  let recordTag = tagName(rootChildren[0]);
  const nested = rootChildren[0];
  if (rootChildren.length === 1) {
    const inner = elementChildren(nested);
    if (inner.length > 1) {
      records = inner;
      recordTag = tagName(inner[0]);
      warnings.push(`Se ha bajado un nivel: <${tagName(root)}> › <${tagName(nested)}>`);
    }
  }

  // Algunos XML exportan un registro único por archivo
  if (records.length === 1 && elementChildren(records[0]).length === 0) {
    records = [root];
    recordTag = tagName(root);
    warnings.push('El archivo contiene un único registro.');
  }

  // Etiquetas presentes (en orden de aparición) y estadísticas de relleno
  const tagOrder = [];
  const tagFill = new Map();
  const tagSamples = new Map();

  for (const rec of records) {
    for (const child of elementChildren(rec)) {
      const tag = tagName(child);
      if (!tag) continue;
      if (!tagFill.has(tag)) {
        tagFill.set(tag, 0);
        tagOrder.push(tag);
        tagSamples.set(tag, '');
      }
      const value = cleanText(textOf(child));
      if (value && !isBlank(value)) {
        tagFill.set(tag, tagFill.get(tag) + 1);
        if (!tagSamples.get(tag)) tagSamples.set(tag, value);
      }
    }
  }

  const rolesByTag = new Map();
  for (const tag of tagOrder) rolesByTag.set(tag, roleOfTag(tag));

  // Campo de fecha: se elige el que tenga más datos entre los candidatos
  const dateTags = tagOrder.filter((t) => rolesByTag.get(t) === 'fecha');
  const dateFieldTag = dateTags.sort((a, b) => // también admite "marca_temporal" etc.
    (tagFill.get(b) || 0) - (tagFill.get(a) || 0))[0] || null;
  if (!dateFieldTag) {
    warnings.push('No se ha encontrado ningún campo de fecha: no se descartarán registros por fecha.');
  }

  const modelTags = tagOrder.filter((t) => rolesByTag.get(t) === 'modelo');
  const explicitPortTag = modelTags.find((t) => /port/.test(normKey(t)));
  const explicitDeskTag = modelTags.find((t) => /(sobremesa|desktop|torre)/.test(normKey(t)));
  const genericModelTags = modelTags.filter((t) => t !== explicitPortTag && t !== explicitDeskTag);

  const today = todayISO();
  const out = [];
  const seen = new Map();

  records.forEach((el, idx) => {
    /** @type {Record<string,string[]>} */
    const values = {};
    for (const child of elementChildren(el)) {
      const tag = tagName(child);
      if (!tag) continue;
      if (!values[tag]) values[tag] = [];
      values[tag].push(cleanText(textOf(child)));
    }

    const first = (tag) => {
      const list = values[tag];
      if (!list) return '';
      return list.find((v) => v && !isBlank(v)) ?? list[0] ?? '';
    };
    const every = (role) => {
      const tags = tagOrder.filter((t) => rolesByTag.get(t) === role);
      for (const tag of tags) {
        const v = first(tag);
        if (v && !isBlank(v)) return { tag, value: v };
      }
      return { tag: tags[0] || null, value: '' };
    };

    const tipoRaw = every('tipo').value;
    const equipoRaw = every('equipo').value;
    const claseRaw = every('clase').value;
    const prioriRaw = every('prioridad').value;

    // ---- marca / modelos (lógica del script original) ----
    const genericModels = [];
    for (const tag of genericModelTags) {
      for (const v of values[tag] || []) genericModels.push(cleanText(v));
    }
    const portModel = cleanText(first(explicitPortTag || '')) || genericModels[0] || '';
    const deskModel = cleanText(first(explicitDeskTag || '')) || genericModels[1] || '';
    const kind = equipoKind(equipoRaw);

    let marca = '';
    if (explicitPortTag || explicitDeskTag) {
      marca = kind === 'portatil' ? portModel : deskModel;
    } else if (genericModels.length) {
      marca = (normVal(equipoRaw).startsWith('port') || kind === 'portatil')
        ? (genericModels[0] || '')
        : (genericModels[1] || genericModels[0] || '');
    }
    if (!marca) marca = genericModels[0] || '';
    const marcaLabel = marca && !isBlank(marca) ? marca : '(vacío)';

    // ---- fecha ----
    let fechaRaw = '';
    let fecha = null;
    let fechaInvalida = false;
    let fechaFutura = false;
    let fechaReason = '';
    if (dateFieldTag) {
      fechaRaw = cleanText(first(dateFieldTag));
      const parsed = parseDateValue(fechaRaw);
      if (!parsed.ok) {
        fechaInvalida = true;
        fechaReason = parsed.reason;
      } else {
        fecha = parsed.iso;
        if (fecha > today) {
          fechaFutura = true;
        }
      }
    }

    // ---- cierre ----
    const cierreRaw = cleanText(every('cierre').value);
    const cierreParsed = cierreRaw ? parseDateValue(cierreRaw) : null;
    const cierre = cierreParsed && cierreParsed.ok ? cierreParsed.iso : null;

    // ---- información útil (criterio del script) ----
    const coreValues = [tipoRaw, equipoRaw, claseRaw, prioriRaw];
    const sinInformacion = coreValues.every((v) => isBlank(v));

    const tipo = cleanText(tipoRaw);
    const equipo = normalizeEquipo(equipoRaw);
    const clase = cleanText(claseRaw);
    const prioridad = normalizePrioridad(prioriRaw);

    const record = {
      idx,
      raw: values,
      tipo,
      equipo,
      equipoKind: kind,
      clase,
      prioridad,
      estado: canonicalEstado(every('estado').value),
      tecnico: cleanText(every('tecnico').value),
      ubicacion: cleanText(every('ubicacion').value),
      descripcion: cleanText(every('descripcion').value),
      origen: cleanText(every('origen').value),
      usuario: cleanText(every('usuario').value),
      id: cleanText(every('id').value),
      marca: marcaLabel,
      marcas: genericModels.map((v) => (isBlank(v) ? '' : v)),
      modeloPortatil: portModel && !isBlank(portModel) ? portModel : '',
      modeloSobremesa: deskModel && !isBlank(deskModel) ? deskModel : '',
      fecha,
      fechaRaw,
      fechaReason,
      cierreRaw,
      cierre,
      horas: numeric(every('horas').value),
      coste: numeric(every('coste').value),
      flags: {
        fechaInvalida,
        fechaFutura,
        sinInformacion,
        sinCampoFecha: !dateFieldTag,
        duplicado: false,
        dupOf: null
      }
    };

    // huecos entre los campos canónicos
    const canonical = [record.tipo, record.equipo, record.clase, record.prioridad,
      record.estado, record.tecnico, record.ubicacion, record.marca];
    record.vacios = canonical.filter((v) => !v || isBlank(v) || v === '(vacío)').length;
    record.esValida = !fechaInvalida && !fechaFutura && !sinInformacion;

    // duplicados por contenido
    const key = [record.tipo, record.equipo, record.clase, record.prioridad,
      record.fechaRaw, record.tecnico, record.descripcion, record.marca]
      .map((v) => normVal(v)).join('|');
    if (key.replace(/\|/g, '')) {
      if (seen.has(key)) {
        record.flags.duplicado = true;
        record.flags.dupOf = seen.get(key);
      } else {
        seen.set(key, idx);
      }
    }

    // índice de búsqueda libre
    record.searchBlob = Object.values(values).flat().join(' ').toLowerCase();
    out.push(record);
  });

  // metadatos de campos
  const fields = tagOrder.map((tag) => {
    const role = rolesByTag.get(tag) || null;
    const fill = tagFill.get(tag) || 0;
    return {
      tag,
      role,
      roleLabel: role ? (role === 'modelo' ? 'Modelo' : ROLE_LABELS[role] || role) : 'Otro',
      fill,
      coverage: out.length ? fill / out.length : 0,
      sample: tagSamples.get(tag) || ''
    };
  }).sort((a, b) => {
    const order = ['fecha', 'tipo', 'equipo', 'clase', 'prioridad', 'estado', 'marca',
      'id', 'tecnico', 'ubicacion', 'descripcion', 'cierre', 'horas', 'origen', 'usuario', 'coste'];
    const ia = order.indexOf(b.role) - order.indexOf(a.role);
    return ia || b.fill - a.fill;
  });

  // resumen del documento
  const valid = out.filter((r) => r.esValida);
  const dates = valid.map((r) => r.fecha).filter(Boolean).sort();
  const invalidDate = out.filter((r) => r.flags.fechaInvalida).length;
  const future = out.filter((r) => r.flags.fechaFutura).length;
  const noInfo = out.filter((r) => r.flags.sinInformacion).length;
  const duplicates = out.filter((r) => r.flags.duplicado).length;

  return {
    filename: meta.filename || 'incidencies.xml',
    size: meta.size || xmlText.length,
    loadedAt: new Date(),
    rootTag: tagName(root),
    recordTag,
    records: out,
    fields,
    dateFieldTag,
    modelTags,
    warnings,
    rawText: xmlText,
    summary: {
      total: out.length,
      valid: valid.length,
      invalidDate,
      future,
      noInfo,
      duplicates,
      excludedByQuality: out.filter((r) => !r.esValida).length,
      coverage: out.length ? valid.length / out.length : 0,
      dateMin: dates[0] || null,
      dateMax: dates[dates.length - 1] || null,
      missing: {
        tipo: out.filter((r) => !r.tipo || isBlank(r.tipo)).length,
        equipo: out.filter((r) => !r.equipo || isBlank(r.equipo)).length,
        clase: out.filter((r) => !r.clase || isBlank(r.clase)).length,
        prioridad: out.filter((r) => !r.prioridad).length,
        marca: out.filter((r) => r.marca === '(vacío)').length,
        fecha: out.filter((r) => !r.fecha).length,
        tecnico: out.filter((r) => !r.tecnico).length,
        ubicacion: out.filter((r) => !r.ubicacion).length
      }
    }
  };
}

/** Fecha de hoy en ISO (reexportada para comodidad de los tests). */
export { todayISO, isoOf };

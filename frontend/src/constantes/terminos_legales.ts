/**
 * Contenidos Legales y Bioéticos de Consentimiento Informado (Capítulo 5)
 * Proyecto: NEUROFOCUS AI - Monitoreo Asistivo del TDAH en el Aula
 * Marco Regulatorio: Ley 548 (Código Niña, Niño y Adolescente), Ley 164 (Telecomunicaciones y TICs de Bolivia), RGPD y FERPA.
 */

export interface ContenidoLegalRol {
  titulo: string;
  subtitulo: string;
  normativa: string;
  icono: string;
  color: string;
  secciones: {
    encabezado: string;
    texto: string;
  }[];
  declaracion_aceptacion: string;
}

export const TERMINOS_POR_ROL: Record<string, ContenidoLegalRol> = {
  ESTUDIANTE: {
    titulo: 'Asentimiento Informado para Estudiantes',
    subtitulo: 'Compromiso de Privacidad y Apoyo Escolar Amigable (Privacy by Design)',
    normativa: 'Art. 143 y 144 de la Ley 548 (Código Niña, Niño y Adolescente del Estado Plurinacional de Bolivia)',
    icono: 'Sparkles',
    color: 'emerald',
    secciones: [
      {
        encabezado: '1. ¿Para qué se utiliza la cámara?',
        texto: 'La cámara de tu computadora no graba videos ni guarda fotos de tu cara en ningún disco ni internet. Únicamente analiza en la memoria temporal (RAM) puntos matemáticos de tu postura y tu mirada para saber cuándo necesitas un descanso mental o cuándo el profesor debe explicar de forma más dinámica.'
      },
      {
        encabezado: '2. Tus derechos y seguridad',
        texto: 'Las alertas del sistema NUNCA se utilizarán para ponerte malas notas, regañarte o castigarte. Si en algún momento te sientes incómodo, puedes avisar a tu profesor o a tus padres para pausar la sesión sin ninguna consecuencia negativa.'
      },
      {
        encabezado: '3. Privacidad Absoluta',
        texto: 'Tus compañeros no pueden ver tus estadísticas personales. Solo tú, tu profesor y el gabinete de psicología tienen acceso a tu reporte para ayudarte a tener un mejor año escolar.'
      }
    ],
    declaracion_aceptacion: 'Entiendo que la cámara me ayuda a estudiar sin grabar videos de mi rostro, y acepto participar en las sesiones de monitoreo asistivo de mi colegio.'
  },

  TUTOR: {
    titulo: 'Consentimiento Informado Parental y Tutor Legal',
    subtitulo: 'Autorización Expresa para Tratamiento de Telemetría Biometríca Escolar',
    normativa: 'Ley 548 (Código Niña, Niño y Adolescente), Ley 164 y Art. 21 de la Constitución Política del Estado',
    icono: 'ShieldCheck',
    color: 'amber',
    secciones: [
      {
        encabezado: '1. Objeto y Alcance de la Autorización',
        texto: 'En calidad de padre, madre o tutor legal del estudiante menor de edad, otorgo mi consentimiento expreso para que el sistema NeuroFocus AI procese telemetría atencional computacional (EAR ocular, Head Pose PnP y varianza motriz) con propósitos estrictamente pedagógicos y de apoyo al TDAH.'
      },
      {
        encabezado: '2. Garantía de No Grabación y Destrucción Volátil (Zero-Storage)',
        texto: 'La institución educativa y el desarrollador garantizan que los fotogramas de video crudo son procesados en memoria volátil e inmediatamente destruidos (Principio de Minimización). Ningún archivo de video de los menores se almacena en servidores locales ni en la nube.'
      },
      {
        encabezado: '3. Derechos ARCO y Revocatoria',
        texto: 'Como tutor legal, mantengo en todo momento el derecho de Acceso, Rectificación, Cancelación y Oposición (ARCO) sobre los reportes psicopedagógicos de mi hijo/pupilo, así como la potestad de revocar este consentimiento mediante solicitud formal sin que esto afecte el derecho a la educación del estudiante.'
      },
      {
        encabezado: '4. Prohibición de Comercialización',
        texto: 'Se prohíbe de manera absoluta la venta, cesión o transferencia de los datos a terceras empresas comerciales, aseguradoras o plataformas de publicidad.'
      }
    ],
    declaracion_aceptacion: 'Declaro bajo juramento ser el padre, madre o tutor legal con patria potestad del menor, y otorgo mi consentimiento informado pleno conforme a la Ley 548.'
  },

  DOCENTE: {
    titulo: 'Acuerdo de Confidencialidad y Uso Pedagógico No Punitivo',
    subtitulo: 'Código de Conducta Ética y Secreto Profesional en el Aula',
    normativa: 'Estatuto del Magisterio y Ley 070 (Avelino Siñani - Elizardo Pérez)',
    icono: 'BookOpen',
    color: 'cyan',
    secciones: [
      {
        encabezado: '1. Principio de No Punición',
        texto: 'El docente se compromete de manera irrevocable a utilizar el Índice de Atención Individual (IAI) y las alertas de desatención como una herramienta de apoyo pedagógico y adaptación didáctica. Queda terminantemente prohibido utilizar el sistema como criterio sancionatorio, disciplinario o para reducir calificaciones académicas.'
      },
      {
        encabezado: '2. Deber de Secreto Profesional',
        texto: 'Toda información atencional observada en el Dashboard en Vivo está sujeta al secreto profesional docente. El profesor no revelará ni comentará las alertas o diagnósticos de un estudiante frente a sus compañeros de clase ni ante terceros ajenos a la comunidad educativa autorizada.'
      },
      {
        encabezado: '3. Custodia de Sesión y Credenciales',
        texto: 'El docente es responsable de cerrar su sesión al ausentarse del aula y de no compartir sus claves de acceso RBAC para evitar visualizaciones no autorizadas del monitor biométrico.'
      }
    ],
    declaracion_aceptacion: 'Me comprometo formalmente a aplicar el sistema bajo principios pedagógicos éticos, no punitivos y bajo estricto secreto profesional escolar.'
  },

  PSICOLOGO: {
    titulo: 'Convenio Deontológico de Confidencialidad Clínica y Psicopedagógica',
    subtitulo: 'Custodia de Historias Clínicas, Diagnósticos DSM-5 y Biomarcadores',
    normativa: 'Código de Ética del Colegio de Psicólogos y Ley General de Salud',
    icono: 'HeartPulse',
    color: 'purple',
    secciones: [
      {
        encabezado: '1. Confidencialidad Deontológica y Diagnósticos Sensibles',
        texto: 'El profesional psicólogo/psicopedagogo asume la custodia legal y ética de los diagnósticos clínicos DSM-5-TR (F90.0 Déficit Atencional, F90.1 Hiperactividad, F90.2 Presentación Combinada) y de los reportes PDF emitidos, los cuales constituyen documentos reservados amparados por el secreto profesional médico-psicológico.'
      },
      {
        encabezado: '2. Validación Humana Obligatoria (Human-in-the-Loop)',
        texto: 'El sistema NeuroFocus AI es un instrumento asistivo de telemetría y en ningún caso reemplaza el juicio clínico ni la evaluación multidisciplinaria humana. Todo dictamen psicopedagógico emitido con base en estos datos debe contar con la firma y sello del profesional colegiado.'
      },
      {
        encabezado: '3. Acceso Restringido a Evidencias de Eventos',
        texto: 'Las capturas visuales de eventos atencionales (somnolencia, fatiga, desvío) solo podrán ser examinadas con fines diagnósticos y correlación curricular dentro del gabinete psicopedagógico.'
      }
    ],
    declaracion_aceptacion: 'Acepto la custodia confidencial de los datos psicopedagógicos bajo el secreto profesional de la psicología y la validación clínica Human-in-the-Loop.'
  },

  DIRECTOR: {
    titulo: 'Gobernanza Institucional, Ciberseguridad y Responsabilidad Escolar',
    subtitulo: 'Compromiso de Gestión y Custodia de la Infraestructura Educativa',
    normativa: 'Reglamento de Unidades Educativas y Ley 164 de Tecnologías de Información',
    icono: 'Building2',
    color: 'blue',
    secciones: [
      {
        encabezado: '1. Responsabilidad Institucional del Centro Educativo',
        texto: 'La Dirección de la Unidad Educativa asume la responsabilidad civil e institucional del resguardo de los servidores, credenciales y redes locales donde opere el sistema NeuroFocus AI, garantizando que el acceso al software esté restringido únicamente al personal autorizado mediante roles RBAC.'
      },
      {
        encabezado: '2. Supervisión del Cumplimiento Bioético',
        texto: 'La Dirección velará por que ningún docente o administrativo haga un uso indebido, coercitivo o discriminatorio de los datos de los estudiantes, garantizando el respeto irrestricto al interés superior del menor amparado en la Ley 548.'
      },
      {
        encabezado: '3. Protocolo de Auditoría y Resguardo de la Base de Datos',
        texto: 'El colegio se compromete a mantener copias de seguridad cifradas de la base de datos SQLite y a custodiar las carpetas de materiales y evidencias bajo esquemas de seguridad informática.'
      }
    ],
    declaracion_aceptacion: 'En representación de la institución educativa, acepto la gobernanza, seguridad y cumplimiento bioético del despliegue tecnológico escolar.'
  },

  SUPERADMIN: {
    titulo: 'Compromiso de Privacidad y Oficial de Seguridad de la Información',
    subtitulo: 'Trazabilidad Forense, Integridad de Infraestructura y Cumplimiento Normativo (Capítulo 5)',
    normativa: 'Ley 164 (Telecomunicaciones y TICs de Bolivia), Ley 548 y Estándar ISO/IEC 27001',
    icono: 'ShieldCheck',
    color: 'indigo',
    secciones: [
      {
        encabezado: '1. Custodia Criptográfica y Principio de Privacidad por Diseño',
        texto: 'El Superadministrador asume la responsabilidad técnica de velar por la no-persistencia de secuencias de video en disco, la preservación de hashes de integridad en la tabla de auditoría de consentimientos y el cifrado de canales WebSocket RFC 6455.'
      },
      {
        encabezado: '2. Gestión Estricta del Control de Accesos (RBAC)',
        texto: 'La creación de usuarios, elevación de privilegios y restablecimiento de credenciales se realizarán bajo estricta solicitud formal e institucional, registrando cada acción en las bitácoras del sistema.'
      },
      {
        encabezado: '3. Respaldo y Continuidad Operativa',
        texto: 'El Oficial de Seguridad ejecutará rutinas periódicas de verificación de integridad y copias de seguridad de la base de datos, garantizando la disponibilidad y confidencialidad de la información institucional.'
      }
    ],
    declaracion_aceptacion: 'Acepto la responsabilidad técnica, legal y forense de la administración de infraestructura y custodia de la privacidad en NeuroFocus AI.'
  },
  SIN_ROL: {
    titulo: 'Términos de Solicitud de Acceso Institucional',
    subtitulo: 'Compromiso de Confidencialidad y Evaluación Asistida',
    normativa: 'Ley 548 (Código Niña, Niño y Adolescente) y Ley 164 de Telecomunicaciones',
    icono: 'FileText',
    color: 'slate',
    secciones: [
      {
        encabezado: '1. Solicitud de Acceso en Espera',
        texto: 'Al registrarse con este perfil, su cuenta queda temporalmente sin privilegios activos hasta que el Superadministrador o la Dirección institucional valide su identidad y le asigne el cargo docente o evaluador correspondiente.'
      },
      {
        encabezado: '2. Deber de Confidencialidad',
        texto: 'Cualquier dato académico o de telemetría al que se tenga acceso posterior a la aprobación estará protegido bajo secreto institucional y no podrá ser compartido fuera de los fines de apoyo pedagógico.'
      }
    ],
    declaracion_aceptacion: 'Declaro que los datos proporcionados son verídicos y acepto que mi solicitud será revisada por la administración antes de habilitar el acceso a la plataforma.'
  }
};

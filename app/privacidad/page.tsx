import type { Metadata } from "next";
import Link from "next/link";
import { contactLine, LegalIdentity, LegalPage } from "@/components/legal-page";
import { indexable } from "@/lib/site";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Qué datos trata ENQORA, para qué, con qué proveedores y cómo ejercer tus derechos.",
  alternates: { canonical: "/privacidad" },
  robots: indexable() ? { index: true, follow: true } : { index: false, follow: false },
};

// Describe el tratamiento de datos tal como funciona la plataforma. Debe revisarlo un abogado
// (Ley 19.628 y Ley 21.719) antes de la apertura; ver docs/ENQORA-PUBLICACION.md.
export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidad" lead="Cómo ENQORA trata los datos personales de quienes usan la plataforma y de las empresas que gestionan en ella.">
      <h2>1. Quién es responsable</h2>
      <LegalIdentity />

      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li><b>Cuenta:</b> correo electrónico, nombre y, si activas avisos por WhatsApp, tu número de teléfono verificado.</li>
        <li><b>Seguridad:</b> dirección IP, navegador y dispositivo de los ingresos, y eventos de seguridad de tu cuenta. Tu contraseña la gestiona el proveedor de autenticación; ENQORA no la conoce.</li>
        <li><b>Empresas:</b> RUT, razón social, nombre de fantasía, giro, régimen tributario, domicilio y las respuestas que entregas sobre tu empresa.</li>
        <li><b>Casos y servicios:</b> lo que describes en tus solicitudes, los mensajes, los documentos que subes, las autorizaciones que otorgas y los mandatos que firmas.</li>
        <li><b>Contabilidad:</b> los registros de compras y ventas y las cartolas bancarias que cargas, y los borradores de declaraciones que se preparan con ellos.</li>
        <li><b>Pagos:</b> cobros, montos, comprobantes de transferencia y el resultado de los pagos en línea. Los datos de tu tarjeta los recibe directamente la pasarela de pago; ENQORA no los recibe ni los guarda.</li>
      </ul>
      <p><b>Nunca te pediremos tu ClaveÚnica, tu clave del SII ni claves bancarias.</b> Cuando ENQORA actúa ante una institución, lo hace con un mandato firmado y verificado.</p>

      <h2>3. Para qué los usamos</h2>
      <ul>
        <li>Prestar los servicios que solicitas: análisis, diagnóstico, cotizaciones, gestiones y contabilidad.</li>
        <li>Proteger tu cuenta: segundo factor obligatorio, avisos de ingresos y registro de actividad.</li>
        <li>Cobrar los servicios y planes que contratas.</li>
        <li>Enviarte avisos sobre tus casos, pagos y mandatos por los canales que elijas.</li>
        <li>Cumplir obligaciones legales y tributarias.</li>
      </ul>
      <p>No vendemos tus datos ni los usamos para publicidad de terceros.</p>

      <h2>4. Inteligencia artificial</h2>
      <p>
        Cuando un profesional de ENQORA lo decide, un agente de inteligencia artificial puede analizar los antecedentes de tu caso
        (descripción, respuestas, datos de la empresa, mensajes y nombres de los documentos) para proponer pasos, situaciones a revisar,
        tareas y preguntas. El agente no decide: toda propuesta la revisa y aprueba una persona antes de que llegue a ti. Un segundo sistema
        de inteligencia artificial audita esas propuestas (normas, fuentes y cálculos) antes de que el equipo las revise. Ambos
        servicios los prestan proveedores externos que actúan como encargados de tratamiento.
      </p>

      <h2>5. Con quién los compartimos</h2>
      <p>Solo con proveedores que necesitamos para operar, que tratan los datos por encargo de ENQORA:</p>
      <ul>
        <li>Supabase: base de datos, autenticación y almacenamiento de documentos.</li>
        <li>Vercel: alojamiento de la aplicación.</li>
        <li>Anthropic: análisis de los agentes de inteligencia artificial.</li>
        <li>OpenAI: auditoría independiente de las propuestas de los agentes.</li>
        <li>Flow: procesamiento de pagos en línea.</li>
        <li>Resend: envío de correos.</li>
        <li>Meta (WhatsApp Business): avisos por WhatsApp, solo si los activas.</li>
      </ul>
      <p>Algunos de estos proveedores procesan datos fuera de Chile. También entregamos información a autoridades cuando la ley lo exige.</p>
      <p>Dentro de ENQORA, solo acceden a un caso las personas del equipo asignadas a él y la supervisión. Las decisiones sensibles requieren la aprobación de una segunda persona.</p>

      <h2>6. Cuánto tiempo los conservamos</h2>
      <p>
        Mientras tu cuenta esté activa y, después, durante los plazos que exigen la normativa tributaria y comercial y los necesarios
        para responder ante reclamos. Los datos operativos sin valor de respaldo (por ejemplo, códigos de verificación vencidos) se eliminan
        automáticamente.
      </p>

      <h2>7. Tus derechos</h2>
      <p>
        Puedes pedir acceso a tus datos, su rectificación, su eliminación, oponerte a ciertos tratamientos y, cuando corresponda, su
        portabilidad, conforme a la Ley N° 19.628 y a la Ley N° 21.719. Para ejercerlos, {contactLine()}. Te responderemos dentro de los
        plazos legales. Si no quedas conforme, puedes recurrir a la autoridad de protección de datos que corresponda.
      </p>

      <h2>8. Seguridad</h2>
      <p>
        Usamos conexiones cifradas, segundo factor de autenticación obligatorio, permisos por fila en la base de datos para que cada persona
        vea solo lo que le corresponde, aprobación de cuatro ojos para decisiones sensibles y registro de auditoría.
      </p>

      <h2>9. Cookies</h2>
      <p>
        Usamos solo cookies necesarias: la sesión, la empresa activa, el reconocimiento de tu dispositivo para los avisos de seguridad y el
        servicio que elegiste antes de registrarte. No usamos cookies de publicidad ni de analítica de terceros.
      </p>

      <h2>10. Cambios</h2>
      <p>Si modificamos esta política, publicaremos la nueva versión aquí con su fecha y te avisaremos de los cambios relevantes.</p>
      <p>Consulta también los <Link href="/terminos">Términos del servicio</Link>.</p>
    </LegalPage>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { contactLine, LegalIdentity, LegalPage } from "@/components/legal-page";
import { indexable } from "@/lib/site";

export const metadata: Metadata = {
  title: "Términos del servicio",
  description: "Cómo funciona ENQORA: cuentas, servicios, cotizaciones, mandatos, pagos y uso de inteligencia artificial.",
  alternates: { canonical: "/terminos" },
  robots: indexable() ? { index: true, follow: true } : { index: false, follow: false },
};

// Describe las reglas de funcionamiento tal como están implementadas. Debe revisarlo un abogado
// antes de la apertura; ver docs/ENQORA-PUBLICACION.md.
export default function TermsPage() {
  return (
    <LegalPage title="Términos del servicio" lead="Las reglas con las que funciona ENQORA. Al crear una cuenta y usar la plataforma, las aceptas.">
      <h2>1. Quién presta el servicio</h2>
      <LegalIdentity />

      <h2>2. Qué es ENQORA</h2>
      <p>
        ENQORA es una plataforma de servicios contables, tributarios, legales y de gestión para empresas en Chile. Combina profesionales y
        herramientas de análisis, incluidos agentes de inteligencia artificial, siempre bajo revisión humana.
      </p>

      <h2>3. Tu cuenta</h2>
      <ul>
        <li>Debes entregar información verdadera y mantenerla actualizada.</li>
        <li>El segundo factor de autenticación es obligatorio. Eres responsable de resguardar tu contraseña y tu dispositivo autenticador.</li>
        <li>Quien registra una empresa declara estar facultado para actuar por ella. Los permisos de cada miembro los asignan sus administradores.</li>
        <li>Nunca compartas tu ClaveÚnica, tu clave del SII ni claves bancarias. ENQORA no las pide.</li>
      </ul>

      <h2>4. Solicitudes, diagnósticos y cotizaciones</h2>
      <ul>
        <li>Cada solicitud se gestiona como un caso con su historial, documentos y tareas.</li>
        <li>Los diagnósticos los revisa y aprueba un profesional antes de entregarse. Indican su nivel de certeza y lo que falta para confirmarlos.</li>
        <li>El precio de un servicio es el de la cotización que aceptas. La cotización indica su alcance, exclusiones y vigencia. Ningún agente de inteligencia artificial fija precios.</li>
        <li>Los planes mensuales se rigen por el precio vigente al momento de contratarlos y se pueden cancelar en cualquier momento.</li>
      </ul>

      <h2>5. Autorizaciones y mandatos</h2>
      <ul>
        <li>ENQORA solo realiza gestiones ante instituciones cuando lo autorizas expresamente en el caso y existe un mandato vigente firmado y verificado.</li>
        <li>Puedes revocar una autorización o un mandato en cualquier momento. La revocación no afecta lo ya realizado.</li>
        <li>Una aprobación interna de ENQORA no reemplaza tu autorización ni constituye un mandato.</li>
      </ul>

      <h2>6. Inteligencia artificial</h2>
      <p>
        Los agentes de inteligencia artificial apoyan el análisis y proponen pasos, situaciones a revisar, tareas y preguntas. No aprueban,
        no fijan precios y no actúan ante instituciones. Toda propuesta la revisa una persona del equipo antes de comunicarse.
      </p>

      <h2>7. Tu información y tus documentos</h2>
      <ul>
        <li>Eres responsable de que la información y los documentos que entregas sean correctos y de que tengas derecho a compartirlos.</li>
        <li>Los resultados dependen de la información disponible. Si falta información, te la pediremos o lo indicaremos en el resultado.</li>
        <li>El tratamiento de datos personales se describe en la <Link href="/privacidad">Política de privacidad</Link>.</li>
      </ul>

      <h2>8. Pagos</h2>
      <ul>
        <li>Puedes pagar por transferencia o, cuando esté habilitado, en línea a través de la pasarela de pago.</li>
        <li>Un pago por transferencia se considera realizado cuando ENQORA lo confirma.</li>
        <li>Cada cobro indica su folio, monto y fecha de vencimiento.</li>
      </ul>

      <h2>9. Uso aceptable</h2>
      <p>No puedes usar ENQORA para fines ilícitos, para suplantar a otra persona o empresa, ni para intentar acceder a información que no te corresponde.</p>

      <h2>10. Cambios y contacto</h2>
      <p>
        Si modificamos estos términos, publicaremos la nueva versión aquí con su fecha y te avisaremos de los cambios relevantes.
        Para consultas, {contactLine()}.
      </p>
    </LegalPage>
  );
}

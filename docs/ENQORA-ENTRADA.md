# ENQORA — Puerta de entrada (M08)

La portada pública (`/`) es un escaparate de ENQORA. Quien ya inició sesión va directo al Centro de control.

## Recorrido

1. **Primer contacto:** «Bienvenido al mundo ENQORA» y el campo para ingresar un RUT.
2. **Demostración de capacidad:**
   - Antecedentes públicos de la empresa: razón social, RUT, inicio de actividades, término de giro y actividades económicas.
   - Siempre se muestran con su **fuente** (SII) y su **fecha de publicación**.
3. **Galería de servicios:**
   - Ocho categorías con escena visual propia: Contabilidad, Constitución de empresas, Formalización, Registro de marcas, Consultas tributarias, Gestión empresarial, Servicios profesionales, y Crecimiento y oportunidades.
   - Se abre una a la vez. Muestra qué resuelve, sus servicios del catálogo (precio «desde» solo si hay tarifa vigente y el servicio no exige criterio profesional) y las formas de trabajar: consulta, contratación puntual y suscripción mensual (esta última, próximamente).
4. **Registro y contratación:**
   - «Comenzar con…» pasa por `/comenzar?servicio=…`, que guarda la elección en una cookie segura por 7 días.
   - La elección se conserva durante el registro, la verificación del correo y el segundo factor.
   - Si el cliente aún no tiene empresa, el Centro de control le pide registrarla. Al crearla, llega directo a la solicitud del servicio elegido (`/comenzar/continuar`).
   - Se usa el mismo registro y la misma autenticación de siempre; no hay un segundo sistema.

## Consulta por RUT: reglas

- **Fuente:** solo las nóminas abiertas del SII sobre **personas jurídicas** (Razón social y Actividades económicas). No contienen ni se consultan datos de personas naturales; si alguien ingresa el RUT de una persona, la pantalla lo explica.
- **Consulta exacta:** una empresa por RUT válido. Nadie puede listar la tabla; las tablas no son legibles directamente, solo a través de `lookup_public_company`.
- **Límite:** 30 consultas por hora por visitante (identificador anónimo, hash de la IP).
- **Advertencia:** el SII advierte que sus nóminas son preliminares. ENQORA las muestra como «información pública según el SII», nunca como un dato verificado.
- **Revisión legal:** la Ley 21.719 de protección de datos personales rige desde el 1 de diciembre de 2026. Conviene que un abogado revise este flujo antes del lanzamiento.

## Carga de los datos (sin terminal)

**Centro de Mando → Datos públicos** (`/mando/datos-publicos`), solo el Administrador ENQORA:

1. Descarga desde el SII el .zip vigente: `PUB_NOMBRES_PJ.zip` y, opcionalmente, `PUB_NOM_ACTECOS.zip`.
2. Súbelo tal cual. El navegador:
   - lo descomprime;
   - detecta la codificación y el separador;
   - propone las columnas y muestra una vista previa de cómo interpretará la primera fila.
3. Indica la fecha de publicación del SII e inicia la carga. Se envía por lotes de 1.000 filas, con barra de avance y opción de detener.
4. Las filas con RUT inválido se descartan en la base de datos.

Base de datos: `supabase/migrations/0009_puerta_entrada.sql`. Prueba: `supabase/tests/0009_puerta_entrada.sql`.

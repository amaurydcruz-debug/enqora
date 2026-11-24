# emisso-payroll (copia parcial, solo para pruebas)

Reglas de cálculo de [emisso-ai/emisso-payroll](https://github.com/emisso-ai/emisso-payroll), licencia MIT (ver LICENSE),
commit `0a29e65` del 2026-04-02. Se copiaron sin cambios de lógica (solo la ruta de importación de `money`):
`money.ts` y `rules/{afp,health,unemployment,gratification,income-tax}.ts`.

Uso: `scripts/pruebas-motores.ts` compara el motor de remuneraciones de ENQORA con este motor independiente sobre
trabajadores ficticios y los mismos parámetros. No forma parte de la aplicación ni se despliega en ninguna pantalla.
Las diferencias conocidas (por decisión legal documentada) se listan en la prueba.

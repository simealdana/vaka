## MOTOR DE ESCENARIOS, SENSIBILIDAD Y ESTRÉS

El sistema debe permitir modificar cualquier supuesto y recalcular inmediatamente toda la operación, mes a mes y año a año.

No debe limitarse a mostrar un resultado final. Debe explicar la cadena causal completa:

**Variable modificada → impacto operativo → impacto financiero → impacto patrimonial → decisiones necesarias.**

### Variables que el usuario debe poder modificar

#### Producción y venta de leche

* Precio de la leche por litro.
* Caída o aumento porcentual del precio.
* Litros producidos por vaca.
* Curva de lactancia.
* Porcentaje de vacas en ordeño.
* Días de lactancia.
* Pérdidas o rechazo de leche.
* Bonificaciones por calidad.
* Costos de refrigeración y transporte.
* Venta directa, venta a industria o transformación en queso.

Ejemplo de consulta:

“¿Qué pasa si el precio de la leche baja 20% durante nueve meses?”

El sistema debe mostrar:

* pérdida mensual de ingresos;
* variación del margen por litro;
* flujo de caja mensual;
* mes en que la caja se vuelve negativa;
* capital adicional requerido;
* impacto sobre EBITDA;
* impacto sobre patrimonio al año 1, 3, 5 y 10;
* probabilidad de insolvencia;
* acciones recomendadas.

---

#### Mortalidad y sanidad

* Mortalidad de becerros.
* Mortalidad de novillas.
* Mortalidad de vacas adultas.
* Enfermedades por categoría.
* Mastitis.
* Abortos.
* Infertilidad.
* Costos veterinarios.
* Pérdida temporal de producción.
* Sacrificio o descarte anticipado.
* Epidemias o eventos sanitarios extraordinarios.

Ejemplo:

“¿Qué pasa si la mortalidad de becerros sube de 5% a 15%?”

El sistema debe calcular:

* cantidad de animales perdidos;
* valor económico directo de las pérdidas;
* reducción de futuras novillas;
* reducción de vacas productivas dentro de 24–36 meses;
* menor crecimiento del hato;
* menor patrimonio futuro;
* impacto sobre capacidad de reemplazo;
* necesidad de comprar animales externos;
* costo adicional para mantener la meta de crecimiento.

---

#### Reproducción

* Tasa de preñez.
* Tasa de concepción por servicio.
* Porcentaje de abortos.
* Edad al primer servicio.
* Edad al primer parto.
* Intervalo entre partos.
* Días abiertos.
* Porcentaje de hembras nacidas.
* Efectividad del toro.
* Inseminación artificial.
* Número de toros necesarios.
* Descarte por infertilidad.

Ejemplo:

“¿Qué pasa si solamente se preña el 65% de las vacas?”

Debe mostrar el impacto inmediato y también el impacto diferido sobre:

* partos;
* número de vacas en ordeño;
* producción de leche;
* nacimientos;
* crecimiento del hato;
* ventas de machos;
* patrimonio futuro.

---

#### Alimentación y pasturas

* Producción de materia seca por hectárea.
* Capacidad de carga.
* Meses de sequía.
* Costo del concentrado.
* Costo de fertilizantes.
* Disponibilidad de silo y heno.
* Pérdidas de reservas.
* Sobrepastoreo.
* Mejora o deterioro de potreros.
* Necesidad de alquiler de tierra.
* Compra extraordinaria de alimento.

Ejemplo:

“¿Qué pasa si el concentrado aumenta 40% y hay seis meses de sequía?”

Debe recalcular:

* costo por vaca;
* costo por litro;
* producción esperada;
* fertilidad;
* condición corporal;
* mortalidad;
* necesidad de vender animales;
* capital operativo requerido;
* patrimonio final.

---

#### Personal y operación

* Número de empleados.
* Salarios.
* Productividad por trabajador.
* Rotación de personal.
* Robo o pérdidas.
* Errores de ordeño.
* Aumento de nómina.
* Ausencia del encargado.
* Contratación de veterinario o administrador.
* Automatización del ordeño.

---

#### Infraestructura

* Falla de bombas.
* Daño del pozo.
* Falta de electricidad.
* Compra o alquiler de maquinaria.
* Reparaciones inesperadas.
* Ampliación de la sala de ordeño.
* Construcción de nuevos potreros.
* Depreciación acelerada.
* Reposición de equipos.

---

#### Variables macroeconómicas

* Inflación en dólares.
* Devaluación.
* Tipo de cambio.
* Precio del combustible.
* Tasas de interés.
* Costo de importaciones.
* Precio de la tierra.
* Precio del ganado.
* Precio de carne.
* Restricciones de transporte.
* Impuestos y regulaciones.

---

## TIPOS DE SIMULACIÓN

El sistema debe ofrecer al menos cinco modos:

### 1. Escenario individual

El usuario modifica una sola variable.

Ejemplo:

“Bajar precio de leche de USD 0,65 a USD 0,50.”

Debe comparar:

* escenario base;
* escenario modificado;
* diferencia absoluta;
* diferencia porcentual.

### 2. Escenario combinado

El usuario modifica varias variables simultáneamente.

Ejemplo:

* leche baja 20%;
* alimento sube 30%;
* mortalidad de becerros sube a 12%;
* sequía de siete meses.

El sistema debe mostrar el efecto conjunto y no simplemente sumar impactos independientes.

### 3. Escenario temporal

La variable cambia durante un período específico.

Ejemplo:

“Durante los meses 14 al 22, el precio de la leche baja 25% y luego se recupera gradualmente.”

Debe permitir:

* fecha de inicio;
* duración;
* recuperación inmediata o gradual;
* repetición del evento.

### 4. Prueba de estrés

Debe incluir escenarios preconfigurados:

* sequía severa;
* colapso del precio de la leche;
* epidemia;
* robo significativo;
* falla de infraestructura;
* inflación de costos;
* combinación de crisis;
* pérdida del comprador principal.

### 5. Monte Carlo

Debe ejecutar miles de simulaciones variando múltiples parámetros dentro de rangos probabilísticos.

Debe mostrar:

* patrimonio promedio;
* patrimonio mediano;
* percentil 10;
* percentil 25;
* percentil 75;
* percentil 90;
* peor escenario;
* mejor escenario;
* probabilidad de quedarse sin caja;
* probabilidad de perder capital;
* probabilidad de duplicar patrimonio;
* capital de reserva recomendado.

---

## COMPARADOR DE ESCENARIOS

El usuario debe poder guardar y comparar escenarios.

Ejemplos:

* Base.
* Pesimista.
* Muy pesimista.
* Optimista.
* Comprar 60 vacas de una vez.
* Comprar 20 vacas por año.
* Conservar todas las hembras.
* Vender parte de las hembras.
* Comprar más tierra.
* Mejorar pasturas.
* Producir queso.
* Vender únicamente leche.

Para cada escenario mostrar:

* inversión inicial;
* aportes adicionales;
* flujo de caja acumulado;
* deuda;
* producción;
* tamaño del hato;
* vacas en ordeño;
* patrimonio;
* rentabilidad;
* TIR;
* VAN;
* riesgo de insolvencia;
* peor déficit de caja;
* mes de punto de equilibrio;
* valor de liquidación.

---

## EXPLICACIÓN DEL RESULTADO

El sistema no debe responder únicamente con tablas o gráficos.

Debe explicar en lenguaje sencillo:

“Al bajar el precio de la leche 20%, tus ingresos disminuyen USD 3.200 mensuales. Durante los primeros seis meses puedes absorber la caída con tu reserva de caja. En el mes 18 la operación queda sin liquidez. Para evitarlo necesitarías aportar USD 24.500, vender aproximadamente 18 animales o retrasar la ampliación de la sala de ordeño.”

Debe diferenciar claramente:

* pérdida de caja;
* pérdida contable;
* reducción del patrimonio;
* dinero convertido en activos;
* costo de oportunidad;
* riesgo futuro.

---

## ANÁLISIS DE SENSIBILIDAD

El sistema debe identificar automáticamente cuáles variables afectan más el resultado.

Ejemplo de salida:

1. Precio de la leche.
2. Producción promedio por vaca.
3. Tasa de preñez.
4. Costo de alimentación.
5. Mortalidad de becerros.
6. Precio de venta del ganado.

Debe mostrar cuánto cambia el patrimonio final cuando cada variable cambia:

* ±5%;
* ±10%;
* ±20%;
* o dentro de un rango personalizado.

También debe identificar:

* variable más peligrosa;
* variable con mayor oportunidad de mejora;
* punto de quiebre;
* valor mínimo necesario para que el proyecto siga siendo rentable.

---

## PREGUNTAS QUE EL SISTEMA DEBE PODER RESPONDER

* ¿Hasta cuánto puede bajar la leche antes de que pierda dinero?
* ¿Cuánto capital necesito si la leche baja 30% durante un año?
* ¿Qué mortalidad máxima soporta el proyecto?
* ¿Qué pasa si no nace ninguna hembra durante seis meses?
* ¿Qué sucede si las novillas tardan 42 meses en parir?
* ¿Qué pasa si debo vender 30 animales de emergencia?
* ¿Cuántos meses de caja debo mantener?
* ¿Qué variable amenaza más mi patrimonio?
* ¿Cuál es el peor escenario razonablemente posible?
* ¿Qué combinación de eventos podría llevarme a la quiebra?
* ¿En qué momento debería frenar el crecimiento?
* ¿Cuándo conviene vender animales para proteger la liquidez?
* ¿Qué inversión reduce más el riesgo?
* ¿Cuánto patrimonio perdería si liquido el negocio en un año específico?
* ¿Cuál es mi patrimonio contable y cuál es mi patrimonio realizable?

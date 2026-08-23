# Nakama Bros — especificación

## Objetivo

Un plataformas de scroll lateral con el pulido de un juego comercial: control
que se siente inmediato, arte legible y con luz, y una capa de efectos que hace
que cada impacto se note.

## Sensación de control (no negociable)

| Regla | Valor | Motivo |
|---|---|---|
| Coyote time | 100 ms | perdona saltar un frame tarde desde el borde |
| Buffer de salto | 120 ms | perdona pulsar un frame antes de aterrizar |
| Altura variable | corte al 42 % | soltar el botón acorta el salto |
| Gravedad al subir | ×0.52 con botón | ápice flotante |
| Gravedad al caer | ×1.32 | la caída pesa |
| Giro en el suelo | 2400 px/s² | el derrape se siente |
| Control en el aire | 68 % del suelo | se corrige, no se pilota |

Un toque de salto sube una tile; mantenerlo, cerca de cuatro.

## Personajes

Seis jugables con el mismo rig y verbos distintos: Luffy (alcance), Zoro
(golpe rápido), Nami (velocidad), Sanji (doble salto), Usopp (distancia),
Chopper (salto alto).

## Marchas (power-ups)

`base → gear2 → gear3 → gear4`. Subir da velocidad, tamaño o armadura; recibir
un golpe baja una marcha; en `base`, cuesta una vida.

## Dificultad

Tres ajustes, y **ninguno toca la tabla de arriba**: el salto y la carrera son
idénticos en los tres, para que lo aprendido en uno sirva en otro y un padre y
un hijo puedan pasarse el mando a mitad de nivel. Lo que cambia es la cuerda
que te dan.

| | Fácil | Normal | Difícil |
|---|---|---|---|
| Vidas | 5 | 3 | 1 |
| Empiezas en | gear 2 (un golpe de margen) | base | base |
| Invulnerabilidad tras el golpe | ×1,6 | ×1 | ×0,7 |
| Reloj del nivel | ×1,5 | ×1 | ×0,85 |

Se lee una sola vez, al arrancar el nivel: decide vidas y reloj al construir la
partida, así que cambiarlo a mitad de fase quedaría a medio aplicar. El rango S
—y con él el dibujo— se puede conseguir en cualquiera de los tres.

## Mundos

East Blue, Alabasta, Skypiea, Water 7, Thriller Bark, Wano. Cada uno con su
paleta, su tileset, su parallax y su clima.

Diecisiete fases. Cinco de las seis islas terminan en una fase de jefe, que es
siempre la última de la isla: la meta que hay pasada la arena no se activa
mientras el jefe siga vivo, así que un jefe en mitad de una isla dejaría la
campaña cortada ahí. Thriller Bark es la que falta.

| Isla | Fases | Jefe |
|---|---|---|
| East Blue | 3 | Buggy |
| Alabasta | 3 | Señor de la Arena |
| Skypiea | 3 | Tirano del Cielo |
| Water 7 | 3 | Jefe Gyojin |
| Thriller Bark | 2 | — |
| Wano | 3 | Kaido |

## Enemigos

Grunt (el goomba), Shielder (hay que rodearlo), Crab (rápido), Fishman (salta),
Bat (vuela en seno), Urchin (no se pisa). Jefes multifase con barra de vida.

## Presentación

- Parallax de 5 capas por bioma, generado con ruido y armónicos que teselan.
- Autotiling por máscara de vecinos + 3 variantes por tile.
- Pase de post: bloom, grade por bioma, viñeta, flash de evento.
- Partículas con capa delante y detrás de las entidades, aditivas opcionales.
- Squash & stretch en salto, aterrizaje e impacto; hit-stop en cada golpe.
- Rim light y oclusión ambiental horneadas en cada frame de sprite.

## Audio

Sin ficheros: los SFX son recetas de osciladores y ruido, la música un
secuenciador por capas cuya intensidad sube en jefes y con el reloj en rojo.

## Accesibilidad

Controles táctiles, gamepad, remapeo por teclado, opción de efectos reducidos,
respeto a `prefers-reduced-motion`, español e inglés.

# CLAUDE.md — Nakama Bros

## Qué es esto

Un plataformas 2D al nivel de los clásicos de Nintendo, con la tripulación del
Sombrero de Paja. Todo el arte se genera por código (no hay ni un solo PNG de
assets): sprites, tiles, cielos y efectos se rasterizan en canvas al arrancar.

Lee `SPEC.md` antes de tocar el motor.

## Arrancar

```bash
npm install
npm run dev          # http://localhost:5173
npm run type-check
npm run test
npm run build
node scripts/shoot.mjs   # capturas en screenshots/ (requiere build previo)
```

## Stack

- React 18 + Vite + TypeScript (mismo stack que `nakama-trivia` y `nakama-words`)
- Tailwind para el shell y el HUD; el juego vive en un `<canvas>`
- Zustand 5 (persist) para ajustes y progreso
- framer-motion sólo en las pantallas, nunca durante el juego
- WebAudio: música y efectos sintetizados en tiempo real

## Arquitectura

```
src/
  types.ts            contrato compartido — cámbialo sólo con motivo
  engine/             loop de paso fijo, input, cámara, RNG, event bus, mates
  physics/            TileMap, flags de tiles, resolución de colisiones
  art/                TODO el arte, generado por código
    pixel.ts          primitivas (px, dither, outline, rimLight, rampas)
    atlas.ts          SheetBuilder → SpriteSheet empaquetado
    characters.ts     rig compartido de los 6 personajes
    enemies.ts        enemigos    items.ts  objetos    effects.ts  efectos
    tiles.ts          tileset con autotiling por bioma
    backgrounds.ts    capas de parallax por bioma
  render/             Renderer (compositor), postfx, partículas, fuente bitmap
  game/               Game (orquestador + implementación de World)
    entities/         Entity base, Player, Enemy, bosses, items, registry
    level/            Level, códec ASCII, definiciones de niveles
  audio/              AudioEngine, recetas de SFX, secuenciador de música
  ui/                 shell React: pantallas, HUD, controles táctiles
  store/              zustand: ajustes y progreso
```

### Reglas de dependencia

- Las entidades **nunca** importan `Game`. Hablan con el mundo por `World`
  (`src/game/world.ts`). Así el grafo es acíclico y son testeables sueltas.
- El arte **nunca** importa lógica de juego. Sólo `types`, `pixel`, `palette`.
- La UI **nunca** toca entidades. Lee `HudSnapshot` por callback.
- Todo color sale de `src/art/palette.ts`. No hay literales de color sueltos
  en el arte.

### Bucle

Paso fijo a 60 Hz con acumulador, render interpolado (`alpha`) y hit-stop.
Las trayectorias de salto son idénticas a 60 y a 144 Hz.

### Resolución

Render interno de 480×270, escalado entero al viewport. `TILE = 16`.

## Convenciones

- Origen de las entidades: **centro-abajo** del hitbox.
- Los niveles se escriben en ASCII (`src/game/level/tileCodec.ts`).
- Los tipos spawneables se registran solos con `registerEntity(...)`.
- Textos de juego en español; el código y los comentarios, en inglés.

## Despliegue

GitHub Pages con `base: '/nakama-bros/'`. CI corre type-check, tests y build.

## Ver el arte que escribes

Una captura del juego es demasiado pequeña para revisar sprites. Para verlos de
verdad:

```bash
npm run build
node scripts/sheets.mjs --sheet crew:luffy --zoom 5
# también: enemies:grunt, items:berry, effects:flash
# contact sheet en screenshots/sheets/, cada animación en una fila,
# sobre damero para que se vean huecos y píxeles sueltos
```

Con varios agentes a la vez, dale a cada uno su propio destino para que no
choquen los builds:

```bash
npx vite build --outDir dist-mio
node scripts/sheets.mjs --dist dist-mio --port 4331 --sheet crew:zoro --zoom 5
```

## Iconos y pantalla de arranque

Todo el arte se genera por código, pero iOS no acepta un SVG como icono de
inicio ni acepta nada que no sea un PNG del tamaño exacto del dispositivo como
imagen de arranque. Así que los PNG también salen de código, sólo que
rasterizados de antemano:

```bash
node scripts/icons.mjs              # public/icons/ + public/icons/splash/
node scripts/icons.mjs --preview    # un solo tamaño, para iterar el diseño
```

El script imprime en `scripts/.startup-links.html` el bloque de
`<link rel="apple-touch-startup-image">` que va en `index.html`; pégalo si
cambias la tabla de dispositivos. Vuelve a ejecutarlo si tocas la marca o la
paleta.

La tarjeta de arranque (`#boot` en `index.html`) repite esa misma composición
en HTML y CSS en línea, para que pinte en el primer frame antes de que cargue
el bundle; `main.tsx` la retira cuando React ya está en pantalla.

El arranque es **una sola toma**: imagen de arranque de iOS → tarjeta `#boot` →
`LoadingScreen` → `TitleScreen`. Las cuatro pintan el mismo atardecer, con el
horizonte al 64% y el sol en el mismo sitio; lo único que cambia entre ellas es
que el agua empieza a moverse. Los valores viven por triplicado —
`scripts/icons.mjs`, el `<style>` de `index.html` y `src/ui/art/SeaScene.tsx` —
porque la tarjeta tiene que pintar sin bundle y el PNG sin navegador. Si tocas
uno, toca los tres y regenera los PNG.

## Arte promocional

```bash
npm run promo                     # public/promo/, tres formatos
node scripts/promo.mjs --frames   # candidatos de fondo, para elegir encuadre
node scripts/promo.mjs --only og  # una sola tarjeta, para iterar
```

Nada de esto está maquetado a mano: el fondo es un frame que el motor ha
renderizado de verdad y los personajes salen del atlas que usa el juego, así
que el arte no puede desviarse de lo que ve el jugador. La tarjeta ancha
(`og-1200x630.png`) es también el `og:image` de la página.

Comparte paleta, marca y tipografía con los iconos a través de
`scripts/lib/brand.mjs`; si tocas una de las dos cosas, regenera ambas.

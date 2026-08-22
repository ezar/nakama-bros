# Nakama Bros ☠️

Un plataformas 2D con la tripulación del Sombrero de Paja, con el listón puesto
en los clásicos del género: control preciso, arte con luz y una capa de efectos
que hace que cada golpe se sienta.

Todo el arte se genera por código. No hay ni un asset de imagen en el
repositorio: sprites, tilesets, cielos, partículas y efectos se rasterizan en
canvas al arrancar, y la música y los efectos se sintetizan con WebAudio.

## Jugar

```bash
npm install
npm run dev
```

| Acción | Teclado | Gamepad |
|---|---|---|
| Mover | ← → / A D | Stick o cruceta |
| Saltar | Espacio / Z | A |
| Atacar | X / J | B / X |
| Correr | Shift / C | Gatillos |
| Pausa | Esc | Start |

En móvil aparecen controles táctiles automáticamente.

## Desarrollo

```bash
npm run type-check
npm run test
npm run build
node scripts/shoot.mjs    # capturas de pantalla en screenshots/
```

La arquitectura está en [`CLAUDE.md`](./CLAUDE.md) y el diseño en
[`SPEC.md`](./SPEC.md).

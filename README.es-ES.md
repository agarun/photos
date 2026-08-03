

# [photos.agarun.com](https://photos.agarun.com)

Mi portafolio de fotografía con galerías, etiquetas, carpetas y un globo 🌎

# Configuración

## Servidor de desarrollo

Los requisitos previos son Node >= 20 y pnpm >= 8.

Primero, instala las dependencias:

```sh
pnpm install
```

Ejecuta el servidor de desarrollo:

```sh
pnpm dev
```

Abre http://localhost:3000 para ver la aplicación!

## Backend de fotos

Este proyecto utiliza Contentful para subir fotos y administrar álbumes fotográficos. Actualmente no se admiten otros CMS.

> **A partir del 30 de abril de 2025, Contentful ha realizado cambios en los beneficios del plan Gratuito al reducir el ancho de banda mensual de activos de 800 GB a 50 GB. Si esperas superar los 50 GB de ancho de banda de CDN al mes, puedes considerar reemplazarlo por otro CMS y actualizar las consultas GraphQL y las variables de entorno según sea necesario.**

Para comenzar, deberás crear un espacio en [Contentful](https://app.contentful.com/). Una vez creado, ve a Settings -> API Keys -> Add API Key.

Aquí verás un ID de espacio y dos tokens. Luego, puedes completar un archivo `.env.local` con estos:

```
CONTENTFUL_SPACE_ID=abcdefghijkl
CONTENTFUL_PREVIEW_ACCESS_TOKEN=roughly40randomcharacters
CONTENTFUL_ACCESS_TOKEN=roughly40randomcharacters
```

Luego, ve a `Content model -> Create content type`. Crea el modelo [Photo Albums](#photo-albums) usando el esquema de abajo. Una vez creado, puedes agregar entradas en la pestaña Content, y subir imágenes al campo de medios de cada entrada.

Este proyecto _no_ hace uso de la Contentful Image API para optimizar las fotos. En cambio, optimizamos las imágenes de antemano convirtiéndolas a `.webp` en un script usando [`cwebp`](https://developers.google.com/speed/webp/download) y [`ImageMagick`](https://formulae.brew.sh/formula/imagemagick):

```
bash scripts/webp.sh <some directory of image files>
```

# Tecnologías

## Desarrollo

El proyecto está escrito en TypeScript, utilizando Zod, Tailwind y [Next.js](https://nextjs.org/).

## Visualización

[Globe.GL](https://github.com/vasturiano/globe.gl) para el globo de la página de inicio y [cobe](https://github.com/shuding/cobe) para el globo de la página Acerca de

[d3-geo](https://threejs.org/) para los datos del globo

[three](https://threejs.org/) para la creación de escenas

## Imágenes

[PhotoSwipe](https://photoswipe.com/) para visores de imágenes (lightboxes)

[Masonic](https://github.com/jaredLunde/masonic) para diseños tipo mampostería (masonry)

[Pig](https://github.com/schlosser/pig.js/) para diseños de cuadrícula de imágenes

[`cwebp`](https://developers.google.com/speed/webp/docs/cwebp) para comprimir imágenes de .jpg a .webp. Consulta `scripts/webp.sh` para obtener detalles sobre la optimización de imágenes.

## Alojamiento

El sitio Next se exporta estáticamente y se aloja en GitHub Pages usando GitHub Actions.

Todos los activos se almacenan en [Contentful](https://www.contentful.com/) y se obtienen desde su punto de conexión GraphQL.

## Esquema de Contentful

### Photo Albums

Este modelo hace referencia a los álbumes destacados en la página principal.

Al solicitarlo, el modelo de Contentful debe crearse con el identificador de API `photoGallery`. Puedes elegir cualquier ID, solo asegúrate de actualizar luego `photoGalleryCollection` donde sea necesario en la base de código.

| Campo       | Tipo de Contentful                       |
| ----------- | ---------------------------------------- |
| title       | Texto corto                              |
| photos      | Media, múltiples archivos                |
| color       | Texto corto - Código de color hexadecimal|
| type        | Texto corto - Enum['location', 'custom']¹|
| description | Texto largo                              |
| date        | Texto corto (opcional)                   |
| lat         | Decimal                                  |
| lng         | Decimal                                  |
| locations   | JSON (opcional)²                         |
| order       | Decimal                                  |

¹ `type: 'location'` se refiere a álbumes en la página principal con datos de coordenadas. `type: 'custom'` tiene una animación especial y no tiene datos de coordenadas, p. ej., el álbum _Music_ en mi sitio.

² Esto es un arreglo de objetos, cada uno con lat, lng y description; p. ej. `[{"lat": 40.00, "lng": 70.00, "description": "narnia"}, ...]`

Para más información, consulta los [esquemas Zod de álbumes](https://github.com/agarun/photos/blob/main/src/types/albums.ts#L14).

### Photo Folders

Este modelo hace referencia a la función de carpetas disponible en la ruta [`/folders`](https://photos.agarun.com/folders).

Al solicitarlo, el modelo de Contentful debe crearse con el identificador de API `photoFolders`. Puedes elegir cualquier ID, solo asegúrate de actualizar luego `photoFoldersCollection` donde sea necesario en la base de código.

Esta función es opcional.

| Campo        | Tipo de Contentful   |
| ------------ | ----------------- |
| title        | Texto corto        |
| parent_title | Texto corto        |
| photos       | Media, múltiples archivos |
| description  | Texto largo        |
| date         | Texto corto        |
| order        | Decimal           |

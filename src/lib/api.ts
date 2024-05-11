async function fetchGraphQL(query: string, preview = false): Promise<any> {
  return fetch(
    `https://graphql.contentful.com/content/v1/spaces/${process.env.CONTENTFUL_SPACE_ID}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${
          preview
            ? process.env.CONTENTFUL_PREVIEW_ACCESS_TOKEN
            : process.env.CONTENTFUL_ACCESS_TOKEN
        }`
      },
      body: JSON.stringify({ query }),
      next: { tags: ['photos'] }
    }
  ).then(response => response.json());
}

export async function getPage(slug: string) {
  const sections = await fetchGraphQL(`
query {
  photoGalleryCollection(where: { title: "${slug}" }) {
    items {
      title
      description
      photosCollection {
        items {
          size
          url
          width
          height
        }
      }
      contentfulMetadata {
        tags {
          name
        }
      }
    }
  }
}
`);
  return sections.data.photoGalleryCollection.items[0].photosCollection.items;
}

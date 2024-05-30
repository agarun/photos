import { Album } from '@/types';
import Link from 'next/link';

type Tag = string;

export function useTags(
  album: Pick<Album, 'date' | 'description' | 'locations'>
) {
  let tags = [];
  tags.push(album.date);
  for (const location of album.locations) {
    tags.push(location.date);
  }
  tags.push(album.description);
  for (const location of album.locations) {
    tags.push(location.description);
  }
  tags = tags.filter(Boolean) as string[];
  return tags;
}

function dateFromTag(tag: Tag) {
  return tag?.match(/\d{4}/g)?.[0];
}

export function TagChip({ tag }: { tag: Tag }) {
  const date = dateFromTag(tag);

  const chip = (
    <div key={tag} className="border border-gray-300 rounded-md px-3 py-1">
      {tag}
    </div>
  );

  if (date) {
    return (
      <Link key={tag} href={`/tags/${date}`} className="hover:bg-gray-300">
        {chip}
      </Link>
    );
  }

  return chip;
}

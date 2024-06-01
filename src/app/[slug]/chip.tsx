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
  // either begins with `20##`, or `20##` is preceded by non-digit
  // e.g. '20241231...', 'IMG_20241231...'
  return tag?.match(/(?:^20|[^\d]20)\d{2}/g)?.[0]?.trim();
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
      <Link
        key={tag}
        href={`/tags/${date}`}
        className="hover:bg-gray-200/50"
        prefetch={false}
      >
        {chip}
      </Link>
    );
  }

  return chip;
}

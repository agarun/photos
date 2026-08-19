export type GuestbookEntryView = {
  id?: string;
  username: string;
  text: string;
  editable?: boolean;
};

export type AlbumPageState = {
  views: number;
  entries: GuestbookEntryView[];
};

export type GuestbookForm = {
  username: string;
  text: string;
};

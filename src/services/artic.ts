export interface ArticArtwork {
  id: number;
  title: string;
  artistTitle: string | null;
  dateDisplay: string | null;
  imageId: string;
  imageUrl: string;
}

interface ArticArtworkResponse {
  data?: {
    id?: number;
    title?: string | null;
    artist_title?: string | null;
    date_display?: string | null;
    image_id?: string | null;
    is_public_domain?: boolean | null;
  }[];
  config?: {
    iiif_url?: string;
  };
}

const ARTIC_API_URL = "https://api.artic.edu/api/v1";
const DEFAULT_IIIF_URL = "https://www.artic.edu/iiif/2";
const ARTIC_IMAGE_SIZE = 256;

const toArtwork = (
  item: NonNullable<ArticArtworkResponse["data"]>[number],
  iiifBase: string,
): ArticArtwork | null => {
  if (!item.id || !item.image_id) {
    return null;
  }

  return {
    id: item.id,
    title: item.title ?? "Untitled",
    artistTitle: item.artist_title ?? null,
    dateDisplay: item.date_display ?? null,
    imageId: item.image_id,
    imageUrl: `${iiifBase}/${item.image_id}/full/${ARTIC_IMAGE_SIZE},${ARTIC_IMAGE_SIZE}/0/default.jpg`,
  };
};

const fields =
  "id,title,artist_title,date_display,image_id,is_public_domain";

const buildSearchUrl = (limit: number, page: number) =>
  `${ARTIC_API_URL}/artworks/search?query[term][is_public_domain]=true&fields=${fields}&limit=${limit}&page=${page}`;

const buildCollectionUrl = (limit: number, page: number) =>
  `${ARTIC_API_URL}/artworks?fields=${fields}&limit=${limit}&page=${page}`;

const fetchJson = async (url: string): Promise<ArticArtworkResponse> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`ArtIC request failed with ${response.status}`);
  }

  return (await response.json()) as ArticArtworkResponse;
};

const normalizeArtworks = (
  json: ArticArtworkResponse,
  limit: number,
): ArticArtwork[] => {
  const iiifBase = json.config?.iiif_url ?? DEFAULT_IIIF_URL;

  return (
    json.data
      ?.filter((item) => item.is_public_domain !== false)
      .map((item) => toArtwork(item, iiifBase))
      .filter((item): item is ArticArtwork => item !== null)
      .slice(0, limit) ?? []
  );
};

export const fetchArticArtworks = async (
  limit: number,
): Promise<ArticArtwork[]> => {
  const requested = Math.max(limit, 1);
  const page = Math.floor(Math.random() * 24) + 1;
  const urls = [
    buildSearchUrl(requested, page),
    buildCollectionUrl(requested * 2, page),
    buildCollectionUrl(requested * 2, 1),
  ];

  const errors: string[] = [];

  for (const url of urls) {
    try {
      const artworks = normalizeArtworks(await fetchJson(url), requested);

      if (artworks.length > 0) {
        return artworks;
      }

      errors.push("empty ArtIC image result");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "unknown error");
    }
  }

  throw new Error(errors[errors.length - 1] ?? "ArtIC returned no images");
};

import { useInfiniteQuery } from "@tanstack/react-query"
import * as v from "valibot"

const pinterestImageSchema = v.object({
    url: v.string(),
})

const pinterestPinSchema = v.object({
    id: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    media: v.object({
        image: pinterestImageSchema,
    }),
    dominant_color: v.optional(v.string()),
    image_medium_url: v.optional(v.string()),
})

const listPinsSchema = v.object({
    items: v.array(pinterestPinSchema),
    bookmark: v.optional(v.string()),
})

export type PinterestPin = v.InferInput<typeof pinterestPinSchema>
export type PinterestImage = v.InferInput<typeof pinterestImageSchema>

const PINTEREST_ACCESS_TOKEN = import.meta.env.VITE_PINTEREST_ACCESS_TOKEN || ""
const PINTEREST_BASE_URL = "https://api.pinterest.com/v3"
const pageItemCount = 20

interface FetchOptions extends Omit<RequestInit, "headers" | "body"> {
    body?: unknown
}

export async function fetchPinterest<TSchema extends v.GenericSchema>(
    path: string,
    schema: TSchema,
    { body, ...options }: FetchOptions = {}
): Promise<v.InferInput<TSchema>> {
    const headers: HeadersInit = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PINTEREST_ACCESS_TOKEN}`,
    }

    const response = await fetch(`${PINTEREST_BASE_URL}${path}`, {
        headers,
        body: body ? JSON.stringify(body) : undefined,
        ...options,
    })

    if (!response.ok) {
        throw new Error(`Failed to fetch Pinterest API: ${response.status}`)
    }

    const json = (await response.json()) as unknown
    const result = v.safeParse(schema, json)

    if (result.issues) {
        throw new Error(`Failed to parse Pinterest API response: ${JSON.stringify(result.issues)}`)
    }

    return result.output
}

export function useListPinsInfinite(query: string) {
    return useInfiniteQuery({
        queryKey: ["pins", query],
        initialPageParam: undefined as string | undefined,
        queryFn: async ({ pageParam, signal }) => {
            const params = new URLSearchParams()
            params.set("fields", "id,title,description,media,image_medium_url,dominant_color")
            params.set("limit", pageItemCount.toString())

            if (pageParam) {
                params.set("bookmark", pageParam)
            }

            if (query.length > 0) {
                params.set("query", query)
            }

            const result = await fetchPinterest(
                `/pins/search?${params.toString()}`,
                listPinsSchema,
                { signal, method: "GET" }
            )

            return {
                items: result.items,
                bookmark: result.bookmark,
            }
        },
        getNextPageParam: (data) => {
            return data.bookmark
        },
    })
}

export async function getRandomPin(searchTerm: string) {
    const params = new URLSearchParams()
    params.set("fields", "id,title,description,media,image_medium_url,dominant_color")
    params.set("limit", "1")

    if (searchTerm.length > 0) {
        params.set("query", searchTerm)
    }

    const result = await fetchPinterest(`/pins/search?${params.toString()}`, listPinsSchema, {
        method: "GET",
    })

    if (result.items.length === 0) {
        throw new Error("No pins found")
    }

    return result.items[0]
}

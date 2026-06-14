import { QueryErrorResetBoundary, useMutation } from "@tanstack/react-query"
import cx from "classnames"
import { Draggable, framer, useIsAllowedTo } from "framer-plugin"
import {
    memo,
    type PropsWithChildren,
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react"
import { ErrorBoundary } from "react-error-boundary"
import { getRandomPin, type PinterestPin, useListPinsInfinite } from "./api"
import { SearchIcon } from "./icons"

const mode = framer.mode

const minWindowWidth = mode === "canvas" ? 260 : 600
const minColumnWidth = 100
const columnGap = 5
const sidePadding = 15 * 2
const resizable = framer.mode === "canvas"

void framer.showUI({
    position: "top right",
    width: minWindowWidth,
    minWidth: minWindowWidth,
    maxWidth: 750,
    minHeight: 400,
    resizable,
})

export function App() {
    const isAllowedToUpsertImage = useIsAllowedTo("addImage", "setImage")

    const [query, setQuery] = useState("")
    const debouncedQuery = useDebounce(query, 200)

    const addRandomMutation = useMutation({
        mutationFn: async (query: string) => {
            const randomPin = await getRandomPin(query)
            const imageUrl = randomPin.media.image.url

            if (mode === "canvas") {
                await framer.addImage({
                    image: imageUrl,
                    name: randomPin.title ?? "Pinterest Pin",
                    altText: randomPin.description ?? undefined,
                })
                return
            }

            await framer.setImage({
                image: imageUrl,
                name: randomPin.title ?? "Pinterest Pin",
                altText: randomPin.description ?? undefined,
            })

            framer.closePlugin()
        },
    })

    return (
        <div className="flex flex-col gap-0 pb-4 h-full">
            <div className="bg-primary mb-[15px] z-10 relative px-[15px]">
                <input
                    type="text"
                    placeholder="Search…"
                    value={query}
                    className="w-full pl-[33px] pr-8"
                    autoFocus
                    style={{ paddingLeft: 30 }}
                    onChange={e => {
                        setQuery(e.target.value)
                    }}
                />
                <div className="flex items-center justify-center absolute left-[25px] top-0 bottom-0 text-tertiary">
                    <SearchIcon />
                </div>
            </div>
            <AppErrorBoundary>
                <PinsList query={debouncedQuery} />
            </AppErrorBoundary>
            <div className="mt-[15px] px-[15px]">
                <button
                    className="items-center flex justify-center relative"
                    onClick={() => {
                        if (!isAllowedToUpsertImage) return
                        addRandomMutation.mutate(query)
                    }}
                    disabled={!isAllowedToUpsertImage}
                    title={isAllowedToUpsertImage ? undefined : "Insufficient permissions"}
                >
                    {addRandomMutation.isPending ? <div className="framer-spinner" /> : "Random Pin"}
                </button>
            </div>
        </div>
    )
}

type PinId = string

const PinsList = memo(function PinsList({ query }: { query: string }) {
    const isAllowedToUpsertImage = useIsAllowedTo("addImage", "setImage")

    const { data, fetchNextPage, isFetchingNextPage, isLoading, hasNextPage } = useListPinsInfinite(query)
    const scrollRef = useRef<HTMLDivElement>(null)
    const [windowWidth, setWindowWidth] = useState(window.innerWidth)
    const deferredWindowWidth = useDeferredValue(windowWidth)
    const previousWindowHeightRef = useRef(window.innerHeight)

    const handleScroll = useCallback(() => {
        if (isFetchingNextPage || isLoading) return

        const scrollElement = scrollRef.current
        if (!scrollElement) return

        const distanceToEnd = scrollElement.scrollHeight - (scrollElement.clientHeight + scrollElement.scrollTop)

        if (distanceToEnd > 150) return

        void fetchNextPage()
    }, [isFetchingNextPage, isLoading, fetchNextPage])

    useEffect(() => {
        const handleResize = () => {
            setWindowWidth(window.innerWidth)

            if (window.innerHeight > previousWindowHeightRef.current) {
                handleScroll()
            }

            previousWindowHeightRef.current = window.innerHeight
        }

        handleResize()
        window.addEventListener("resize", handleResize)
        return () => {
            window.removeEventListener("resize", handleResize)
        }
    }, [handleScroll])

    const addPinMutation = useMutation({
        mutationFn: async (pin: PinterestPin) => {
            const imageUrl = pin.media.image.url

            if (mode === "canvas") {
                await framer.addImage({
                    image: imageUrl,
                    name: pin.title ?? "Pinterest Pin",
                    altText: pin.description ?? undefined,
                })

                return
            }

            await framer.setImage({
                image: imageUrl,
                name: pin.title ?? "Pinterest Pin",
                altText: pin.description ?? undefined,
            })

            framer.closePlugin()
        },
    })

    useEffect(() => {
        const scrollElement = scrollRef.current

        if (scrollElement) scrollElement.scrollTop = 0
    }, [query])

    useEffect(() => {
        const scrollElement = scrollRef.current
        if (!scrollElement || isLoading) return

        const isScrollable = scrollElement.scrollHeight > scrollElement.clientHeight

        if (isScrollable || !hasNextPage) return

        void fetchNextPage()
    }, [data, hasNextPage, fetchNextPage, deferredWindowWidth, isLoading])

    const [pinsColumns, columnWidth] = useMemo(() => {
        const adjustedWindowWidth = deferredWindowWidth - sidePadding
        const columnCount = Math.max(1, Math.floor((adjustedWindowWidth + columnGap) / (minColumnWidth + columnGap)))
        const columnWidth = (adjustedWindowWidth - (columnCount - 1) * columnGap) / columnCount
        const heightPerColumn = Array<number>(columnCount).fill(0)

        const seenPins = new Set<PinId>()
        const columns = Array.from({ length: columnCount }, (): PinterestPin[] => [])

        if (!data) return [columns, columnWidth]

        for (const page of data.pages) {
            for (const pin of page.items) {
                if (seenPins.has(pin.id)) continue
                seenPins.add(pin.id)

                const itemHeight = columnWidth * 1.2

                const minColumnIndex = heightPerColumn.indexOf(Math.min(...heightPerColumn))
                if (minColumnIndex === -1) continue

                columns[minColumnIndex]?.push(pin)
                if (heightPerColumn[minColumnIndex] === undefined) throw new Error("Logic error")
                heightPerColumn[minColumnIndex] += itemHeight
            }
        }
        return [columns, columnWidth] as const
    }, [data, deferredWindowWidth])

    const isLoadingVisible = isLoading || isFetchingNextPage

    if (!isLoadingVisible && pinsColumns[0]?.length === 0) {
        return <div className="flex-1 flex items-center justify-center text-tertiary">No pins found</div>
    }

    return (
        <div
            className="overflow-auto relative flex-1 rounded-[8px] mx-[15px] no-scrollbar"
            ref={scrollRef}
            onScroll={handleScroll}
        >
            <div className="relative">
                <div className="flex gap-[5px]">
                    {pinsColumns.map((pins, i) => (
                        <div
                            key={`column-${i}`}
                            className="shrink-0 flex flex-col gap-[5px]"
                            style={{ width: columnWidth }}
                        >
                            {pins.map(pin => (
                                <GridItem
                                    key={pin.id}
                                    pin={pin}
                                    height={columnWidth * 1.2}
                                    width={columnWidth}
                                    loading={addPinMutation.isPending && addPinMutation.variables?.id === pin.id}
                                    onSelect={addPinMutation.mutate}
                                    isAllowedToUpsertImage={isAllowedToUpsertImage}
                                />
                            ))}
                            {isLoadingVisible && <Placeholders index={i} />}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
})

interface GridItemProps {
    pin: PinterestPin
    height: number
    width: number
    loading: boolean
    onSelect: (pin: PinterestPin) => void
    isAllowedToUpsertImage: boolean
}

const GridItem = memo(function GridItem({
    pin,
    loading,
    height,
    width,
    onSelect,
    isAllowedToUpsertImage,
}: GridItemProps) {
    const handleClick = useCallback(() => {
        onSelect(pin)
    }, [onSelect, pin])
    const [imageLoaded, setImageLoaded] = useState(false)

    useEffect(() => {
        const img = new Image()
        img.src = pin.image_medium_url || pin.media.image.url
        img.onload = () => {
            setImageLoaded(true)
        }
    }, [pin.image_medium_url, pin.media.image.url])

    return (
        <div key={pin.id} className="flex flex-col gap-[5px]">
            <Draggable
                data={{
                    type: "image",
                    image: pin.media.image.url,
                    previewImage: pin.image_medium_url || pin.media.image.url,
                    name: pin.title ?? "Pinterest Pin",
                    altText: pin.description ?? undefined,
                }}
            >
                <button
                    onClick={() => {
                        if (!isAllowedToUpsertImage) return
                        handleClick()
                    }}
                    className="cursor-pointer bg-cover relative rounded-lg overflow-hidden"
                    style={{
                        height,
                        backgroundImage: `url(${pin.image_medium_url || pin.media.image.url})`,
                        backgroundColor: pin.dominant_color || "#e0e0e0",
                    }}
                    disabled={!isAllowedToUpsertImage}
                    title={isAllowedToUpsertImage ? undefined : "Insufficient permissions"}
                >
                    <>
                        <div
                            className={cx(
                                "absolute top-0 right-0 left-0 bottom-0 rounded-lg flex items-center justify-center transition-all pointer-events-none",
                                loading && "bg-black-dimmed"
                            )}
                        >
                            {loading && <div className="framer-spinner bg-reversed" />}
                        </div>
                    </>
                </button>
            </Draggable>
            {pin.title && (
                <div className="text-2xs text-tertiary whitespace-nowrap overflow-hidden text-ellipsis">
                    {pin.title}
                </div>
            )}
        </div>
    )
})

const AppErrorBoundary = ({ children }: PropsWithChildren<object>) => (
    <QueryErrorResetBoundary>
        {({ reset }) => (
            <ErrorBoundary
                onReset={reset}
                fallbackRender={({ resetErrorBoundary }) => (
                    <div className="flex flex-1 items-center justify-center flex-col max-w-[200px] m-auto text-tertiary">
                        Could not load pins
                        <button
                            className="bg-transparent hover:bg-transparent active:bg-transparent text-blue-600 outline-hidden"
                            onClick={() => {
                                resetErrorBoundary()
                            }}
                        >
                            Try again
                        </button>
                    </div>
                )}
            >
                {children}
            </ErrorBoundary>
        )}
    </QueryErrorResetBoundary>
)

const placeholderHeights = [
    [120, 70, 90, 86],
    [70, 140, 120, 70],
    [140, 60, 70, 90],
    [90, 130, 60, 120],
]

const Placeholders = ({ index }: { index: number }) => {
    const heights = placeholderHeights[index % placeholderHeights.length]
    if (!heights) return null

    return heights.map((height, heightIndex) => (
        <div key={heightIndex} className="animate-pulse">
            <div className="bg-secondary rounded-md" style={{ height }} />
            <div className="mt-1 bg-secondary rounded-md h-[8px]" />
        </div>
    ))
}

function useDebounce<T>(value: T, delay: number) {
    const [debouncedValue, setDebouncedValue] = useState<T>(value)

    useEffect(() => {
        const debounce = setTimeout(() => {
            setDebouncedValue(value)
        }, delay)

        return () => {
            clearTimeout(debounce)
        }
    }, [value, delay])

    return debouncedValue
}

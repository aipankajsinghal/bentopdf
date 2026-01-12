export const searchState = {
    query: '',
    matches: [] as any[], // { pageIndex, textContentItems: [ { str, transform, width, height } ] } logic is complex
    currentMatchIndex: -1,
    isSearching: false
};

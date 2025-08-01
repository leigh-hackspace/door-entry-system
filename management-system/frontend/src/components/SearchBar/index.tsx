interface Props {
  search: readonly [search: () => string, setSearch: (search: string) => void];
}

export function SearchBar(props: Props) {
  return (
    <div class="search input-group">
      <span class="input-group-text">🔍</span>
      <input
        type="text"
        class="form-control"
        value={props.search[0]()}
        placeholder="Quick Search..."
        on:keyup={(e) => props.search[1](e.currentTarget.value)}
      />
    </div>
  );
}

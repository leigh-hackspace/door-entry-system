import { For } from "npm:solid-js";

interface Props {
  class?: string;
  page: number;
  pageSize: number;
  count: number;

  onPage: (page: number) => void;
}

/*
  I need a function that will generate page numbers for a pagination control. Given a page of 20, a page size of 10 and a total record count of 220, it should give an array of page numbers for the buttons [13,14,15,16,17,18,19,20,21,22]. The number of buttons is capped at 10 and obviously cannot exceed 22 in this example because that would be out of bounds. If there are less than 10 * page size number of records then we would expect to see less than 10 buttons.
*/

export function Pagination(props: Props) {
  const first = () => (props.page - 1) * props.pageSize + 1;
  const last = () => Math.min(props.page * props.pageSize, props.count);

  const pageCount = () => Math.ceil(props.count / props.pageSize);

  return (
    <div class="d-flex gap-2 justify-content-md-end align-items-center">
      <div>
        Records {first()} to {last()} of {props.count}
      </div>

      <ul class="pagination mb-0">
        <li class="page-item">
          <a
            class="page-link"
            classList={{ disabled: props.page <= 1 }}
            href="#"
            aria-label="Previous"
            on:click={() => props.onPage(Math.min(props.page - 1, 1))}
          >
            <span aria-hidden="true">◀</span>
          </a>
        </li>
        <For each={generatePaginationButtons(props.page, props.pageSize, props.count)}>
          {(i) => (
            <li class="page-item" classList={{ active: props.page === i }}>
              <a class="page-link" href="#" on:click={() => props.onPage(i)}>
                {i}
              </a>
            </li>
          )}
        </For>
        <li class="page-item">
          <a
            class="page-link"
            classList={{ disabled: props.page >= pageCount() }}
            href="#"
            aria-label="Next"
            on:click={() => props.onPage(Math.max(props.page + 1, pageCount()))}
          >
            <span aria-hidden="true">▶</span>
          </a>
        </li>
      </ul>
    </div>
  );
}

function generatePaginationButtons(currentPage: number, pageSize: number, totalRecords: number, maxButtons = 10) {
  /**
   * Generate page numbers for a pagination control.
   *
   * @param {number} currentPage - The current page number (1-based index).
   * @param {number} pageSize - The number of records per page.
   * @param {number} totalRecords - The total number of records.
   * @param {number} maxButtons - The maximum number of buttons to display.
   * @returns {number[]} - An array of page numbers for the pagination buttons.
   */

  const totalPages = Math.ceil(totalRecords / pageSize); // Total number of pages
  const halfButtons = Math.floor(maxButtons / 2);

  // Calculate start and end page numbers for the buttons
  let startPage = Math.max(1, currentPage - halfButtons);
  const endPage = Math.min(totalPages, startPage + maxButtons - 1);

  // Adjust start page if we don't have enough buttons at the end
  startPage = Math.max(1, endPage - maxButtons + 1);

  // Generate the list of page numbers
  const buttons = [];
  for (let i = startPage; i <= endPage; i++) {
    buttons.push(i);
  }

  return buttons;
}

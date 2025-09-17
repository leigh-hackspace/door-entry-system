export function downloadFile(file_name: string, file_data: Uint8Array) {
  // Create a blob from the Uint8Array data
  const blob = new Blob([file_data], { type: "application/octet-binary" }); // Change the type if needed
  const url = URL.createObjectURL(blob);

  // Create a link to the blob URL and click it
  const a = document.createElement("a");
  a.href = url;
  a.download = file_name;
  a.click(); // This will trigger the download
  URL.revokeObjectURL(url); // Clean up
}

export function uploadFile() {
  return new Promise<[string, Uint8Array]>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.addEventListener("change", (e) => {
      if (!input.files?.length) return reject(new Error("No file!"));
      const reader = new FileReader();
      const file = input.files[0];
      reader.readAsArrayBuffer(file);
      reader.addEventListener("loadend", () => {
        if (reader.result) {
          return resolve([file.name, new Uint8Array(reader.result as ArrayBuffer)]);
        } else {
          return reject("Could not read file!");
        }
      });
    });
    input.click();
  });
}

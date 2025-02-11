import type {} from "npm:@types/web-bluetooth";
import { render } from "npm:solid-js/web";

// deno-lint-ignore no-process-globals
const VERSION = process.env.VERSION;

const SERVICE_ID = "937312e0-2354-11eb-9f10-fbc30a62cf38";
const CHAR_ID = "987312e0-2354-11eb-9f10-fbc30a62cf38";

async function getService() {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ name: "Main Space" }],
    optionalServices: [SERVICE_ID], // Replace with the service UUID you need
  });

  if (!device.gatt) throw new Error("No gatt!");

  const server = await device.gatt.connect();

  return server.getPrimaryService(SERVICE_ID);
}

async function writeToService(service: BluetoothRemoteGATTService) {
  const characteristic = await service.getCharacteristic(CHAR_ID); // Replace with the characteristic UUID

  const encoder = new TextEncoder();
  const value = encoder.encode("Hello Bluetooth");

  await characteristic.writeValue(value);

  alert("Door is open!");
}

function App() {
  let service: BluetoothRemoteGATTService | undefined;

  const onButtonClick = async () => {
    try {
      if (!service) {
        service = await getService();
      }

      writeToService(service);
    } catch (err) {
      alert(err);
    }
  };

  return (
    <div class="container">
      <div>Version = {VERSION}</div>

      <a href="#" class="big-button" on:click={onButtonClick}>
        Open
      </a>
    </div>
  );
}

function main() {
  function invokeServiceWorkerUpdateFlow(registration: ServiceWorkerRegistration) {
    // TODO implement your own UI notification element
    if (confirm("New version of the app is available. Refresh now?")) {
      if (registration.waiting) {
        // let waiting Service Worker know it should became active
        registration.waiting.postMessage("SKIP_WAITING");
      }
    }
  }

  // check if the browser supports serviceWorker at all
  if ("serviceWorker" in navigator && globalThis.location.hostname !== "localhost") {
    // wait for the page to load
    globalThis.addEventListener("load", async () => {
      // register the service worker from the file specified
      const registration = await navigator.serviceWorker.register("/service-worker.js");

      // ensure the case when the updatefound event was missed is also handled
      // by re-invoking the prompt when there's a waiting Service Worker
      if (registration.waiting) {
        invokeServiceWorkerUpdateFlow(registration);
      }

      // detect Service Worker update available and wait for it to become installed
      registration.addEventListener("updatefound", () => {
        if (registration.installing) {
          // wait until the new Service worker is actually installed (ready to take over)
          registration.installing.addEventListener("statechange", () => {
            if (registration.waiting) {
              // if there's an existing controller (previous Service Worker), show the prompt
              if (navigator.serviceWorker.controller) {
                invokeServiceWorkerUpdateFlow(registration);
              } else {
                // otherwise it's the first install, nothing to do
                console.log("Service Worker initialized for the first time");
              }
            }
          });
        }
      });

      let refreshing = false;

      // detect controller change and refresh the page
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!refreshing) {
          globalThis.location.reload();
          refreshing = true;
        }
      });
    });
  }

  render(App, document.getElementById("app")!);
}

main();

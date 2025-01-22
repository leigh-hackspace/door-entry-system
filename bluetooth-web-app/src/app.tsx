import type {} from "npm:@types/web-bluetooth";
import { render } from "npm:solid-js/web";

const SERVICE_ID = "937312e0-2354-11eb-9f10-fbc30a62cf38";
const CHAR_ID = "987312e0-2354-11eb-9f10-fbc30a62cf38";

async function getService() {
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
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
      <a href="#" class="big-button" on:click={onButtonClick}>
        Open
      </a>
    </div>
  );
}

function main() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then(() => {
        console.log("Service Worker Registered");
      })
      .catch((err) => {
        console.error("Service Worker Registration Failed:", err);
      });
  }

  render(App, document.getElementById("app")!);
}

main();

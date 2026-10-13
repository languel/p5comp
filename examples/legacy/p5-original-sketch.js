let port;
let reader;
let serialText = "";
let sensorDistance = 0;
let connectButton;

let  t = 0;


function setup() {
  createCanvas(600, 600);
  connectButton = createButton("Connect Arduino");
  connectButton.position(10, 10);
  connectButton.mousePressed(connectArduino);
  textAlign(CENTER, CENTER);
}

function draw() {
  // background(230, 230, 250);
  // fill(102, 51, 153);
  // noStroke();
  // textSize(72);

  // text(
  //   sensorDistance.toFixed(1) + " cm",
  //   width / 2,
  //   height / 2
  // );
}

// Connect to Arduino
async function connectArduino() {
  if (!navigator.serial) {
    alert("Open this sketch in desktop Chrome or Edge.");
    return;
  }

  try {
    port = await navigator.serial.requestPort();
    await port.open({
      baudRate: 9600 //speed of arduino, same rate
    });

    connectButton.html("Arduino connected");
    reader = port.readable.getReader();
    readArduino();

  } catch (error) {

    console.log("Connection error:");
    console.log(error);
  }

}

let plotStep = 50;
function drawAnalogSensor( t, v, n=0 ) {
  circle(t,v + plotStep*n, 5);
}
//// sensor simulator
function mouseDragged() {
  let v = map(mouseY,0,width, 0, 40)

  t = (t+1 ) % width;

  if (keyIsPressed && key == '1') {
      drawAnalogSensor(t,v,1 );
  console.log(mouseX.toFixed() + " " + mouseY.toFixed());
  }

   if (keyIsPressed && key == '2') {
       drawAnalogSensor(t,v,2 );
  console.log(mouseX.toFixed() + " " + mouseY.toFixed());
  }
  
  
}

function keyPressed() {
  /// button
  if(key === 'a') {
    console.log("a is pressed");
    fill('red');
    rect(width/2,height/2,20);
  }

    if(key === 'b') {
    console.log("a is pressed");
    fill('green');
    rect(width/2,height/2,20);
  }
  
  
}
////////////////

// Read incoming Arduino data
function readArduino() {
  reader.read().then(function(result) {
    if (result.done) {
      return;
    }

    let decoder = new TextDecoder();
    serialText =
      serialText +
      decoder.decode(result.value);
    
    let lines = serialText.split("\n");

    // Save an incomplete final line
    serialText = lines.pop();

    // Read each complete line
    for (let line of lines) {

      let number = Number(line.trim());

      if (!isNaN(number)) {
        sensorDistance = number;//
      }
    }

    // Read the next Arduino message
    readArduino();
  });
}
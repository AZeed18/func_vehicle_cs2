import { Instance as i } from "cs_script/point_script";

const ZEROVECTOR = {x:0, y:0, z:0};

/**
 * How much degrees allowed to deviate from known directions as error caused by player rotating while moving
 * 
 * Must be < 45
 */
const DEVIATION = 22.5;

/**
 * Velocity at which the vehicle reaches maximum torque
 */
const FULLTORQUEVELOCITY = 300;

/**
 * Angle at which wheels steer
 */
const STEERINGANGLE = 30;

/**
 * Queue of every new occupied seat
 * 
 * Used to continue vehicle occupation on the next OnThink call
 */
const newOccupantsQueue = [];

/**
 * Queue of player entity for every new abandoner
 * 
 * Used to continue vehicle abandonment on the next OnThink call
 */
const newAbandonersQueue = [];

class Vehicle {
	constructor(vecName){
		this.body = i.FindEntityByName(vecName + '_body');
		this.wheelsAnchor = i.FindEntityByName(vecName + '_wheels_angular_anchor');

		this.thrusters = {};
		this.thrusters.forward = vecName + '_forward';
		this.thrusters.right = vecName + '_right';
	}

	toggleThrusters(direction, on){
		if (on)
			i.EntFireAtName({name: this.thrusters[direction], input: "Activate"});
		else
			i.EntFireAtName({name: this.thrusters[direction], input: "Deactivate"});
	}

	scaleThrusters(direction, scale){
		i.EntFireAtName({name: this.thrusters[direction], input: "Scale", value: scale});
	}

	isWheeled(){
		return this.wheelsAnchor != undefined;
	}
}

class Seat {
	static occupiedSeats = new Map(); // seat button entity => occupied Seat
	static playerSeats = new Map(); // player entity => occupied Seat

	static inVehicle(ply){
		return Seat.playerSeats.get(ply) != undefined;
	}

	constructor(seatButton, occupant){
		Seat.occupiedSeats.set(seatButton, this);
		
		this.seatButton = seatButton;
		this.name = this.seatButton.GetEntityName().replace(/_button$/, '');

		// create Vehicle object
		const vecName = this.name.replace(/_seat(\d+)$/, '');
		this.vehicle = new Vehicle(vecName);

		this.seatIn = i.FindEntityByName(this.name + '_in');
		this.seatOut = i.FindEntityByName(this.name + '_out');

		this.occupy(occupant);
	}

	occupy(occupant){
		Seat.playerSeats.set(occupant, this);

		this.occupant = occupant;
		this.floor = i.FindEntityByName('func_vehicle_template').ForceSpawn()[0];

		// parent passenger to seat
		if (!this.isDriver())
			this.occupant.SetParent(this.seatIn);

		// disable collisions
		occupant.SetEntityName('func_vehicle_player');
		i.EntFireAtName({name: 'func_vehicle_collision', input: 'DisableCollisions'});
		newOccupantsQueue.push(this);

		// start all thrusters at scale 0
		if (this.isDriver()){
			this.vehicle.toggleThrusters('forward', true);
			this.vehicle.scaleThrusters('forward', 0);
			this.vehicle.toggleThrusters('right', true);
			this.vehicle.scaleThrusters('right', 0);
		}
	}

	deoccupy(teleport=true){
		// stop all thrusters
		if (this.isDriver()){
			this.vehicle.toggleThrusters('forward', false);
			this.vehicle.toggleThrusters('right', false);
		}

		// remove seat floor
		this.floor.Remove();

		// if player is not exiting because of disconnection
		if (this.occupant != undefined && this.occupant.GetPlayerController() != undefined){
			if (teleport) this.teleportOccupant(false);

			this.occupant.SetParent(null);

			// enable collisions
			this.occupant.SetEntityName('func_vehicle_player');
			i.EntFireAtName({name: 'func_vehicle_collision', input: 'EnableCollisions'});
			newAbandonersQueue.push(this.occupant);
		}
		
		// remove seat from occupied seats
		Seat.occupiedSeats.delete(this.seatButton);
		
		// remove occupant from player seats map
		Seat.playerSeats.delete(this.occupant);
	}

	isDriver(){
		return this.name.endsWith('0');
	}

	teleportOccupant(inside=true){
		if (inside)
			this.occupant.Teleport(this.seatIn.GetAbsOrigin(), this.seatIn.GetAbsAngles(), ZEROVECTOR);
		else {
			const seatOutAngles = this.seatOut.GetAbsAngles();
			seatOutAngles.roll = 0;
			this.occupant.Teleport(this.seatOut.GetAbsOrigin(), seatOutAngles, ZEROVECTOR);
		}
	}
}

// --------------------
// Functions
// --------------------

/**
 * Find magnitude of a vector
 */
function magnitude(v){
	return Math.sqrt(v.x**2 + v.y**2 + v.z**2);
}

/**
 * Find yaw of a vector
 */
function findYaw(v){
	v.z = 0;

	const m = magnitude(v);

	// calculate normalized velocity vector (i.e., direction vector)
	const d = {
		x: v.x/=m,
		y: v.y/=m
	}

	// calculate the yaw of direction vector
	return Math.atan2(d.y, d.x) / Math.PI * 180;
}

// --------------------
// Callbacks
// --------------------

i.OnRoundStart(() => {
	Seat.occupiedSeats.clear();

	while (newOccupantsQueue.length)
		newOccupantsQueue.pop().occupant.SetEntityName('');

	while (newAbandonersQueue.length)
		newAbandonersQueue.pop().SetEntityName('');

	for (const seatButton of i.FindEntitiesByName("*_seat*_button"))
		i.ConnectOutput(seatButton, "OnPressed", useVehicle);
});

// For testing
for (const seatButton of i.FindEntitiesByName("*_seat*_button"))
	i.ConnectOutput(seatButton, "OnPressed", useVehicle);

i.OnPlayerKill((ev) => {
	const seat = Seat.playerSeats.get(ev.player);
	if (seat != undefined) seat.deoccupy();
});

i.OnPlayerDisconnect((_) => {
	for (const [_, seat] of Seat.occupiedSeats)
		if (seat.occupant == undefined || seat.occupant.GetPlayerController() == undefined)
			return seat.deoccupy();
});

// --------------------
// IO Functions
// --------------------

/**
 * If player not in vehicle: occupy seat
 * If player using his seat's door: exit
 */
function useVehicle({caller, activator}){
	const [seatButton, ply] = [caller, activator];

	const seat = Seat.occupiedSeats.get(seatButton);
	// not occupied and player is not in a vehicle
	if (seat == undefined){
		if (!Seat.inVehicle(ply))
			new Seat(seatButton, ply);
	}
	// already occupied but by same player, then he meant to exit
	else if (seat.occupant === ply)
		seat.deoccupy();
}

// --------------------
// OnThink
// --------------------

i.SetThink(() => {
	while (newOccupantsQueue.length){
		const seat = newOccupantsQueue.pop();
		seat.teleportOccupant();
		seat.occupant.SetEntityName('');
	}

	while (newAbandonersQueue.length)
		newAbandonersQueue.pop().SetEntityName('');

	for (const [_, seat] of Seat.occupiedSeats){
		const seatInAngles = seat.seatIn.GetAbsAngles();
		const undrivable = Math.abs(seatInAngles.pitch) > 45 || Math.abs(seatInAngles.roll) > 40;

		// if driver, detect his movement direction to move vehicle before teleporting him
		if (seat.isDriver()){
			// reset wheels anchor yaw
			const vecAngles = seat.vehicle.body.GetAbsAngles();
			if (seat.vehicle.isWheeled())
				seat.vehicle.wheelsAnchor.Teleport(null, vecAngles, null);
			
			// reset all thrusters to 0
			seat.vehicle.scaleThrusters('forward', 0);
			seat.vehicle.scaleThrusters('right', 0);

			// if vehicle is undrivable, use parenting to make dirver orientation follow vehicle angles
			if (undrivable && seat.occupant.GetParent() == undefined){
				seat.occupant.SetParent(seat.seatIn);
				seat.occupant.Teleport(null, {yaw: seat.occupant.GetEyeAngles().yaw, pitch: seat.occupant.GetEyeAngles().pitch, roll: 0})
			}

			// if drivable, drive
			if (!undrivable) {
				seat.occupant.SetParent(null);

				// get driver velocity
				const drvVelVec = seat.occupant.GetAbsVelocity();

				// if driver moved
				if ((drvVelVec.x != 0 || drvVelVec.y != 0)){
					// find driver movement yaw relative to his eyes yaw
					const drvYaw = seat.occupant.GetEyeAngles().yaw;
					const drvVelYaw = findYaw(drvVelVec);
					const drvRelYaw = (drvVelYaw - drvYaw + 360) % 360;

					// calculate torque scale
					const vecVelVec = seat.vehicle.body.GetAbsVelocity();
					vecVelVec.z = 0;
					const vecVel = magnitude(vecVelVec);
					const scale = Math.min(vecVel/FULLTORQUEVELOCITY, 1);

					// find vehicle movement yaw relative to its yaw
					const vecYaw = vecAngles.yaw;
					const vecVelYaw = findYaw(vecVelVec);
					const vecRelYaw = vecVelYaw - vecYaw;
					const forward = Math.cos(vecRelYaw / 180 * Math.PI) > 0

					// determine movement direction relative to driver's direction to activate the right thruster(s) (https://developer.valvesoftware.com/wiki/QAngle)
					// forward
					if ((drvRelYaw > 0 && drvRelYaw < 0 + DEVIATION) || (drvRelYaw > 360 - DEVIATION && drvRelYaw < 360))
						seat.vehicle.scaleThrusters('forward', 1);
					// backward
					else if (drvRelYaw > 180 - DEVIATION && drvRelYaw < 180 + DEVIATION)
						seat.vehicle.scaleThrusters('forward', -1);
					// left
					else if (drvRelYaw > 90 - DEVIATION && drvRelYaw < 90 + DEVIATION){
						if (seat.vehicle.isWheeled()){
							vecAngles.yaw += STEERINGANGLE;
							seat.vehicle.wheelsAnchor.Teleport(null, vecAngles, null);
						}

						seat.vehicle.scaleThrusters('right', forward ? -scale : scale);
					}
					// right
					else if (drvRelYaw > 270 - DEVIATION && drvRelYaw < 270 + DEVIATION){
						if (seat.vehicle.isWheeled()){
							vecAngles.yaw -= STEERINGANGLE;
							seat.vehicle.wheelsAnchor.Teleport(null, vecAngles, null);
						}

						seat.vehicle.scaleThrusters('right', forward ? scale : -scale);
					}
					// forward left
					else if (drvRelYaw > 45 - DEVIATION && drvRelYaw < 45 + DEVIATION){
						if (seat.vehicle.isWheeled()){
							vecAngles.yaw += STEERINGANGLE;
							seat.vehicle.wheelsAnchor.Teleport(null, vecAngles, null);
						}

						seat.vehicle.scaleThrusters('right', forward ? -scale : scale);
						seat.vehicle.scaleThrusters('forward', 1);
					}
					// forward right
					else if (drvRelYaw > 315 - DEVIATION && drvRelYaw < 315 + DEVIATION){
						if (seat.vehicle.isWheeled()){
							vecAngles.yaw -= STEERINGANGLE;
							seat.vehicle.wheelsAnchor.Teleport(null, vecAngles, null);
						}

						seat.vehicle.scaleThrusters('right', forward ? scale : -scale);
						seat.vehicle.scaleThrusters('forward', 1);
					}
					// backward left
					else if (drvRelYaw > 135 - DEVIATION && drvRelYaw < 135 + DEVIATION){
						if (seat.vehicle.isWheeled()){
							vecAngles.yaw += STEERINGANGLE;
							seat.vehicle.wheelsAnchor.Teleport(null, vecAngles, null);
						}

						seat.vehicle.scaleThrusters('right', forward ? -scale : scale);
						seat.vehicle.scaleThrusters('forward', -1);
					}
					// backward right
					else if	(drvRelYaw > 225 - DEVIATION && drvRelYaw < 225 + DEVIATION){
						if (seat.vehicle.isWheeled()){
							vecAngles.yaw -= STEERINGANGLE;
							seat.vehicle.wheelsAnchor.Teleport(null, vecAngles, null);
						}

						seat.vehicle.scaleThrusters('right', forward ? scale : -scale);
						seat.vehicle.scaleThrusters('forward', -1);
					}
				}
			}
		}

		const newOrigin = seat.seatIn.GetAbsOrigin();
		newOrigin.z += 2;
		if (seat.isDriver() && !undrivable){
			seat.floor.Teleport(seat.seatIn.GetAbsOrigin(), ZEROVECTOR, null);
			seat.occupant.Teleport(newOrigin, null, ZEROVECTOR);
		}
		else {
			seat.floor.Teleport(seat.seatIn.GetAbsOrigin(), seatInAngles, null);
			seat.occupant.Teleport(newOrigin, null, null);
		}
	}
	i.SetNextThink(i.GetGameTime());
});
i.SetNextThink(i.GetGameTime());

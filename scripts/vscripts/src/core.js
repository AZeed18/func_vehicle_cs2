import { Instance as i } from "cs_script/point_script";

export const ZEROVECTOR = {x:0, y:0, z:0};

export class Vehicle {
	/**
	 * How much degrees allowed to deviate from known directions as error caused by player rotating while moving
	 * 
	 * Must be < 45
	 */
	static DEVIATION = 22.5;

	/**
	 * Velocity at which the vehicle reaches maximum torque
	 */
	static FULLTORQUEVELOCITY = 300;

	/**
	 * Angle at which wheels steer
	 */
	static STEERINGANGLE = 30;

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

	drive(forward=false, backward=false, right=false, left=false){
		// find vehicle movement yaw relative to its yaw
		const vecAngles = this.body.GetAbsAngles();
		const vecYaw = vecAngles.yaw;
		const vecVelVec = this.body.GetAbsVelocity();
		const vecVelYaw = findYaw(vecVelVec);
		const vecRelYaw = vecVelYaw - vecYaw;

		// calculate torque scale
		const vecVel = magnitude(vecVelVec);
		const vecRelYawCos = Math.cos(vecRelYaw / 180 * Math.PI);
		const scale = Math.min(vecVel/Vehicle.FULLTORQUEVELOCITY, 1) * Math.sign(vecRelYawCos);

		// steer by updating wheels anchor angle
		if (this.isWheeled()){
			if (right)
				vecAngles.yaw -= Vehicle.STEERINGANGLE;
			else if (left)
				vecAngles.yaw += Vehicle.STEERINGANGLE;
			this.wheelsAnchor.Teleport(null, vecAngles, null);
		}

		// forward thrusters/torques
		if (forward)
			this.scaleThrusters('forward', 1);
		else if (backward)
			this.scaleThrusters('forward', -1);
		else
			this.scaleThrusters('forward', 0);

		// steering thrusters/torques
		if (right)
			this.scaleThrusters('right', scale);
		else if (left)
			this.scaleThrusters('right', -scale);
		else
			this.scaleThrusters('right', 0);
	}
}

export class Seat {
	/**
	 * Queue of every new occupied seat
	 * 
	 * Used to continue vehicle occupation on the next OnThink call
	 */
	static newOccupantsQueue = [];

	/**
	 * Queue of player entity for every new abandoner
	 * 
	 * Used to continue vehicle abandonment on the next OnThink call
	 */
	static newAbandonersQueue = [];
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
		Seat.newOccupantsQueue.push(this);

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
			Seat.newAbandonersQueue.push(this.occupant);
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

function magnitude(v){
	return Math.sqrt(v.x**2 + v.y**2)
}

export function findYaw(v){
	const m = magnitude(v);

	// calculate normalized velocity vector (i.e., direction vector)
	const d = {
		x: v.x/m,
		y: v.y/m
	}

	// calculate the yaw of direction vector
	return Math.atan2(d.y, d.x) / Math.PI * 180;
}

/**
 * If player not in vehicle: occupy seat
 * If player using his seat's door: exit
 */
export function useVehicle({caller, activator}){
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

i.OnPlayerKill(({player}) => {
	const seat = Seat.playerSeats.get(player);
	if (seat != undefined) seat.deoccupy();
});

i.OnPlayerDisconnect((_) => {
	for (const [_, seat] of Seat.occupiedSeats)
		if (seat.occupant == undefined || seat.occupant.GetPlayerController() == undefined)
			return seat.deoccupy();
});

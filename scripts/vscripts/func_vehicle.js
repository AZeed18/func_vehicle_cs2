import { Instance } from 'cs_script/point_script';

const ZEROVECTOR = {x:0, y:0, z:0};

class Vehicle {
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

	steeringInfo = []

	lastSteer = null;

	constructor(vecName){
		this.body = Instance.FindEntityByName(vecName + '_body');

		this.forward = vecName + '_forward';
		this.right = vecName + '_right';

		// parse steering info
		for (const infoEntity of Instance.FindEntitiesByName(vecName + '*[steer *]*')){
			const info = {};
			info.entity = infoEntity;
			[info.rotation, info.angle] = infoEntity.GetEntityName().match(/.*\[steer (.*?)\].*/)[1].split(' ');
			info.angle = Number(info.angle);

			this.steeringInfo.push(info);
		}
	}

	scaleThrusters(direction, scale){
		Instance.EntFireAtName({name: this[direction], input: "Scale", value: scale});
	}

	isWheeled(){
		return this.wheelsAnchor != undefined;
	}

	drive(forward=0, backward=0, right=0, left=0){
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

		// steer
		for (const info of this.steeringInfo){
			const steeredAngles = info.entity.GetAbsAngles();
			if (right)
				steeredAngles[info.rotation] += info.angle;
			else if (left)
				steeredAngles[info.rotation] -= info.angle;
			if (this.lastSteer === 'right')
				steeredAngles[info.rotation] -= info.angle;
			else if (this.lastSteer === 'left')
				steeredAngles[info.rotation] += info.angle;
			info.entity.Teleport(null, steeredAngles, null);
		}

		// remember current steer direction
		if (right)
			this.lastSteer = 'right';
		else if (left)
			this.lastSteer = 'left';
		else
			this.lastSteer = null;

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

class Seat {
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
		this.seatButton = seatButton;
		this.name = this.seatButton.GetEntityName().replace(/_button$/, '');

		// create Vehicle object
		const vecName = this.name.replace(/_seat(\d+)$/, '');
		this.vehicle = new Vehicle(vecName);

		this.seatIn = Instance.FindEntityByName(this.name + '_in');
		this.seatOut = Instance.FindEntityByName(this.name + '_out');

		this.occupy(occupant);

		Seat.occupiedSeats.set(seatButton, this);
	}

	occupy(occupant){
		this.occupant = occupant;
		this.floor = Instance.FindEntityByName('func_vehicle_template').ForceSpawn()[0];

		// parent passenger to seat
		if (!this.isDriver())
			this.occupant.SetParent(this.seatIn);

		// disable collisions
		occupant.SetEntityName('func_vehicle_player');
		Instance.EntFireAtName({name: 'func_vehicle_collision', input: 'DisableCollisions'});
		Seat.newOccupantsQueue.push(this);

		Seat.playerSeats.set(occupant, this);
	}

	deoccupy(teleport=true){
		// stop all thrusters
		if (this.isDriver()){
			this.vehicle.scaleThrusters('forward', 0);
			this.vehicle.scaleThrusters('right', 0);
		}

		// remove seat floor
		this.floor.Remove();

		// if player is not exiting because of disconnection
		if (this.occupant != undefined && this.occupant.GetPlayerController() != undefined){
			if (teleport) this.teleportOccupant(false);

			this.occupant.SetParent(null);

			// enable collisions
			this.occupant.SetEntityName('func_vehicle_player');
			Instance.EntFireAtName({name: 'func_vehicle_collision', input: 'EnableCollisions'});
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

function findYaw(v){
	const m = magnitude(v);

	// calculate normalized velocity vector (i.e., direction vector)
	const d = {
		x: v.x/m,
		y: v.y/m
	};

	// calculate the yaw of direction vector
	return Math.atan2(d.y, d.x) / Math.PI * 180;
}

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

Instance.OnPlayerKill(({player}) => {
	const seat = Seat.playerSeats.get(player);
	if (seat != undefined) seat.deoccupy();
});

Instance.OnPlayerDisconnect((_) => {
	for (const [_, seat] of Seat.occupiedSeats)
		if (seat.occupant == undefined || seat.occupant.GetPlayerController() == undefined)
			return seat.deoccupy();
});

Instance.OnRoundStart(() => {
	Seat.occupiedSeats.clear();

	while (Seat.newOccupantsQueue.length)
		Seat.newOccupantsQueue.pop().occupant.SetEntityName('');

	while (Seat.newAbandonersQueue.length)
		Seat.newAbandonersQueue.pop().SetEntityName('');

	for (const seatButton of Instance.FindEntitiesByName("*_seat*_button"))
		Instance.ConnectOutput(seatButton, "OnPressed", useVehicle);
});

// For testing
for (const seatButton of Instance.FindEntitiesByName("*_seat*_button"))
	Instance.ConnectOutput(seatButton, "OnPressed", useVehicle);

Instance.SetThink(() => {
	while (Seat.newOccupantsQueue.length){
		const seat = Seat.newOccupantsQueue.pop();
		seat.teleportOccupant();
		seat.occupant.SetEntityName('');
	}

	while (Seat.newAbandonersQueue.length)
		Seat.newAbandonersQueue.pop().SetEntityName('');

	for (const [_, seat] of Seat.occupiedSeats){
		const seatInAngles = seat.seatIn.GetAbsAngles();
		const undrivable = Math.abs(seatInAngles.pitch) > 45 || Math.abs(seatInAngles.roll) > 40;

		// if driver, detect his movement direction to move vehicle before teleporting him
		if (seat.isDriver()){
			// reset vehicle
			seat.vehicle.drive(0,0,0,0);

			// if vehicle is undrivable, use parenting to make dirver orientation follow vehicle angles
			if (undrivable && seat.occupant.GetParent() == undefined){
				seat.occupant.SetParent(seat.seatIn);
				seat.occupant.Teleport(null, {yaw: seat.occupant.GetEyeAngles().yaw, pitch: seat.occupant.GetEyeAngles().pitch, roll: 0});
			}

			// if drivable, drive
			if (!undrivable){
				seat.occupant.SetParent(null);

				// get driver velocity
				const drvVelVec = seat.occupant.GetAbsVelocity();

				// if driver moved
				if ((drvVelVec.x != 0 || drvVelVec.y != 0)){
					// find driver movement yaw relative to his eyes yaw
					const drvYaw = seat.occupant.GetEyeAngles().yaw;
					const drvVelYaw = findYaw(drvVelVec);
					const drvRelYaw = (drvVelYaw - drvYaw + 360) % 360;

					// determine movement direction relative to driver's direction to activate the right thruster(s) (https://developer.valvesoftware.com/wiki/QAngle)
					// forward
					if ((drvRelYaw > 0 && drvRelYaw < 0 + Vehicle.DEVIATION) || (drvRelYaw > 360 - Vehicle.DEVIATION && drvRelYaw < 360))
						seat.vehicle.drive(1,0,0,0);
					// backward
					else if (drvRelYaw > 180 - Vehicle.DEVIATION && drvRelYaw < 180 + Vehicle.DEVIATION)
						seat.vehicle.drive(0,1,0,0);
					// left
					else if (drvRelYaw > 90 - Vehicle.DEVIATION && drvRelYaw < 90 + Vehicle.DEVIATION)
						seat.vehicle.drive(0,0,0,1);
					// right
					else if (drvRelYaw > 270 - Vehicle.DEVIATION && drvRelYaw < 270 + Vehicle.DEVIATION)
						seat.vehicle.drive(0,0,1,0);
					// forward left
					else if (drvRelYaw > 45 - Vehicle.DEVIATION && drvRelYaw < 45 + Vehicle.DEVIATION)
						seat.vehicle.drive(1,0,0,1);
					// forward right
					else if (drvRelYaw > 315 - Vehicle.DEVIATION && drvRelYaw < 315 + Vehicle.DEVIATION)
						seat.vehicle.drive(1,0,1,0);
					// backward left
					else if (drvRelYaw > 135 - Vehicle.DEVIATION && drvRelYaw < 135 + Vehicle.DEVIATION)
						seat.vehicle.drive(0,1,0,1);
					// backward right
					else if	(drvRelYaw > 225 - Vehicle.DEVIATION && drvRelYaw < 225 + Vehicle.DEVIATION)
						seat.vehicle.drive(0,1,1,0);
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
	Instance.SetNextThink(Instance.GetGameTime());
});
Instance.SetNextThink(Instance.GetGameTime());

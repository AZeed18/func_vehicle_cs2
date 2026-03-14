import { Instance as i } from "cs_script/point_script";

export const ZEROVECTOR = {x:0, y:0, z:0};

export const CSInputs = {
	NONE: 0,
	FORWARD: 1 << 0,
	BACK: 1 << 1,
	LEFT: 1 << 2,
	RIGHT: 1 << 3,
	WALK: 1 << 4,
	DUCK: 1 << 5,
	JUMP: 1 << 6,
	USE: 1 << 7,
	ATTACK: 1 << 8,
	ATTACK2: 1 << 9,
	RELOAD: 1 << 10,
	SHOW_SCORES: 1 << 11,
	LOOK_AT_WEAPON: 1 << 12
}

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

	static occupiedVecs = [];

	steeringInfo = []

	lastSteer = null;

	occupiedSeats = [];

	constructor(vecName){
		this.body = i.FindEntityByName(vecName + '_body');
		this.forward = vecName + '_forward';
		this.right = vecName + '_right';

		// parse steering info
		for (const steerEnt of i.FindEntitiesByName(vecName + '_steer')){
			this.steeringInfo.push({
				entity: steerEnt.GetParent(),
				deviation: Object.entries(steerEnt.GetLocalAngles()).filter(([_, ang]) => {return ang!=0})
			});
		}

		Vehicle.occupiedVecs.push(this);
	}

	addSeat(seat){
		this.occupiedSeats.push(seat);
	}

	removeSeat(seat){
		// remove vehicle from occupied seats
		let index = this.occupiedSeats.indexOf(seat);
		this.occupiedSeats.splice(index);

		// remove vehicle from occupied vehicles
		if (!this.occupiedSeats.length){
			index = Vehicle.occupiedVecs.indexOf(this);
			Vehicle.occupiedVecs.splice(index);
		}
	}

	deoccupy(){
		for (const seat of this.occupiedSeats)
			seat.deoccupy(false);
	}

	scaleThrusters(direction, scale){
		i.EntFireAtName({name: this[direction], input: "Scale", value: scale});
	}

	isWheeled(){
		return this.wheelsAnchor != undefined;
	}

	drive(forward=false, backward=false, right=false, left=false){
		// find vehicle movement yaw relative to its yaw
		const vecVelVec = this.body.GetAbsVelocity();
		const vecVelYaw = findYaw(vecVelVec);
		const vecRelYaw = vecVelYaw - this.body.GetAbsAngles()["yaw"];

		// calculate torque scale
		const vecVel = magnitude2d(vecVelVec);
		const vecRelYawCos = Math.cos(vecRelYaw / 180 * Math.PI);
		const scale = Math.min(vecVel/Vehicle.FULLTORQUEVELOCITY, 1) * Math.sign(vecRelYawCos);

		// steer
		for (const info of this.steeringInfo){
			const steeredAngles = info.entity.GetAbsAngles();
			if (right)
				for (const [rot, ang] of info.deviation)
					steeredAngles[rot] += ang;
			else if (left)
				for (const [rot, ang] of info.deviation)
					steeredAngles[rot] -= ang;
			if (this.lastSteer === 'right')
				for (const [rot, ang] of info.deviation)
					steeredAngles[rot] -= ang;
			else if (this.lastSteer === 'left')
				for (const [rot, ang] of info.deviation)
					steeredAngles[rot] += ang;
			info.entity.Teleport({angles: steeredAngles});
		}

		// remember current steer direction
		if (right == left)
			this.lastSteer = null;
		else if (right)
			this.lastSteer = 'right';
		else if (left)
			this.lastSteer = 'left';

		// forward thrusters/torques
		if (forward == backward)
			this.scaleThrusters('forward', 0);
		else if (forward)
			this.scaleThrusters('forward', 1);
		else
			this.scaleThrusters('forward', -1);

		// steering thrusters/torques
		if (right == left)
			this.scaleThrusters('right', 0);
		else if (right)
			this.scaleThrusters('right', scale);
		else
			this.scaleThrusters('right', -scale);
	}
}

export class Seat {
	static DAMAGETHRESHOLD = 5;

	static occupiedSeats = new Map(); // seat button entity => occupied Seat
	static playerSeats = new Map(); // player entity => occupied Seat

	/** 
	 * A counter of occupation during the whole round, used to give players unique names instead of seat names that can be repeated for a player not occupying any vehicle
	 */
	static counter = 0;

	/**
	 * Queue of every new occupied seat
	 * 
	 * Used to continue vehicle occupation on the next OnThink call
	 */
	static newOccupantsQueue = [];

	static reset(){
		Vehicle.occupiedVecs.length = 0;
		Seat.occupiedSeats.clear();
		Seat.playerSeats.clear();
		Seat.counter = 0;
		Seat.newOccupantsQueue.length = 0;
		Seat.connectDoors();
		Seat.resetNames();
	}

	static connectDoors(){
		for (const seatButton of i.FindEntitiesByName("*_seat*_button"))
			i.ConnectOutput(seatButton, "OnPressed", useVehicle);
	}

	static resetNames(){
		for (const occupant of i.FindEntitiesByName('*_func_vehicle_occupant*'))
			occupant.SetEntityName('');
	}

	static inVehicle(ply){
		return Seat.playerSeats.get(ply) != undefined;
	}

	collisions = []

	constructor(seatButton, occupant){
		this.seatButton = seatButton;
		this.name = this.seatButton.GetEntityName().replace(/_button$/, '');

		// create Vehicle object
		const vecName = this.name.replace(/_seat(\d+)$/, '');
		this.vehicle = new Vehicle(vecName);

		this.seatIn = i.FindEntityByName(this.name + '_in');
		this.seatOut = i.FindEntityByName(this.name + '_out');

		this.occupy(occupant);

		this.occuapantVel = this.occupant.GetAbsVelocity();

		Seat.occupiedSeats.set(seatButton, this);
	}

	occupy(occupant){
		this.occupant = occupant;

		const template = i.FindEntityByName('func_vehicle_template');
		if (template != undefined)
			[this.floor, ...this.collisions] = template.ForceSpawn();
		else
			[this.floor, ...this.collisions] = [undefined];

		// disable collisions
		this.occupant.SetEntityName(this.name + '_func_vehicle_occupant' + ++Seat.counter);
		for (const collision of this.collisions)
			i.EntFireAtTarget({target: collision, input: 'DisableCollisionsWith', value: this.occupant.GetEntityName()});

		this.vehicle.addSeat(this);

		Seat.newOccupantsQueue.push(this);

		Seat.playerSeats.set(this.occupant, this);

		// API
		i.EntFireAtTarget({target: this.seatIn, input: 'FireUser1', value: this.name.replace(/.*(\d+)/, '$1'), activator: this.occupant})
	}

	deoccupy(teleport=true){
		// reset thrusters and steering
		if (this.isDriver())
			this.vehicle.drive(false,false,false,false);

		// remove seat floor
		this.floor?.Remove();

		// if player is not exiting because of disconnection
		if (this.occupant != undefined && this.occupant.GetPlayerController() != undefined){
			if (teleport) this.teleportOccupant(false);

			// enable collisions
			for (const collision of this.collisions){
				i.EntFireAtTarget({target: collision, input: 'EnableCollisions'});
				i.EntFireAtTarget({target: collision, input: 'Kill'});
			}
		}

		this.vehicle.removeSeat(this);

		// remove seat from occupied seats
		Seat.occupiedSeats.delete(this.seatButton);

		// remove occupant from player seats map
		Seat.playerSeats.delete(this.occupant);

		// API
		if (this.seatIn.IsValid())
			i.EntFireAtTarget({target: this.seatIn, input: 'FireUser2', value: this.name.replace(/.*(\d+)/, '$1'), activator: this.occupant})
	}

	isDriver(){
		return this.name.endsWith('0');
	}

	teleportOccupant(inside=true){
		if (inside){
			const occupantAngles = this.occupant.GetAbsAngles();
			occupantAngles.yaw += this.seatIn.GetAbsOrigin().yaw;
			this.occupant.Teleport({position: this.seatIn.GetAbsOrigin(), angles: occupantAngles});
		}
		else {
			// if no out of seat entity, estimate out of seat position and orientation
			if (this.seatOut == undefined){
				this.occupant.SetParent(this.seatIn);
				const seatInLocalY = this.seatIn.GetLocalOrigin().y;
				i.EntFireAtTarget({target: this.occupant, input: "SetLocalOrigin", value: `0 ${seatInLocalY > 0 ? 64 : -64} 16`})
				i.EntFireAtTarget({target: this.occupant, input: "ClearParent"})

				// look at the door
				const occupantAngles = this.vehicle.body.GetAbsAngles();
				occupantAngles.roll = 0;
				occupantAngles.yaw += seatInLocalY > 0 ? -90 : 90;
				this.occupant.Teleport({angles: occupantAngles});
			}
			else {
				const seatOutAngles = this.seatOut.GetAbsAngles();
				seatOutAngles.roll = 0;
				this.occupant.Teleport({position: this.seatOut.GetAbsOrigin(), angles: seatOutAngles});
				this.occupant.SetParent(null);
			}
		}
	}

	damage(){
		const occuapantVel = this.occupant.GetLocalVelocity();
		const acc = magnitude2d(occuapantVel)-magnitude2d(this.occuapantVel);
		const damage = Math.round(acc**2/30000);

		if (damage >= Seat.DAMAGETHRESHOLD){
			const health = this.occupant.GetHealth();
			const newHealth = health - damage;
			if (newHealth > 0)
				this.occupant.SetHealth(newHealth);
			else
				this.occupant.Kill();
		}

		this.occuapantVel = occuapantVel;
	}
}

function magnitude2d(v){
	return Math.sqrt(v.x**2 + v.y**2)
}

export function findYaw(v){
	const m = magnitude2d(v);

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
	// occupied by another player, force him out
	else
		seat.deoccupy();
}

i.OnRoundStart(Seat.reset);
i.OnScriptInput("reload", Seat.connectDoors);

i.OnScriptReload({after: () => {
	Seat.connectDoors();
	Seat.resetNames();
}});

i.OnPlayerKill(({player}) => {
	const seat = Seat.playerSeats.get(player);
	if (seat != undefined) seat.deoccupy(false);
});

i.OnPlayerDisconnect((_) => {
	for (const [_, seat] of Seat.occupiedSeats)
		if (seat.occupant == undefined || seat.occupant.GetPlayerController() == undefined)
			return seat.deoccupy(false);
});

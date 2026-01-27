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

	steeringInfo = []

	lastSteer = null;

	constructor(vecName){
		this.body = i.FindEntityByName(vecName + '_body');
		this.forward = vecName + '_forward';
		this.right = vecName + '_right';

		// parse steering info
		for (const infoEntity of i.FindEntitiesByName(vecName + '*[steer *]*')){
			const info = {};
			info.entity = infoEntity;
			[info.rotation, info.angle] = infoEntity.GetEntityName().match(/.*\[steer (.*?)\].*/)[1].split(' ');
			info.angle = Number(info.angle)

			this.steeringInfo.push(info);
		}
	}

	scaleThrusters(direction, scale){
		i.EntFireAtName({name: this[direction], input: "Scale", value: scale});
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
		const vecVel = magnitude2d(vecVelVec);
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

export class Seat {
	/**
	 * Queue of every new occupied seat
	 * 
	 * Used to continue vehicle occupation on the next OnThink call
	 */
	static newOccupantsQueue = [];

	/** 
	 * A count of all occupations since round start, used to give players unique names instead of seat names that can be repeated for a player not occupying any vehicle
	 */
	static counter = 0;
	static occupiedSeats = new Map(); // seat button entity => occupied Seat
	static playerSeats = new Map(); // player entity => occupied Seat

	static init(){
		for (const seatButton of i.FindEntitiesByName("*_seat*_button"))
			i.ConnectOutput(seatButton, "OnPressed", useVehicle);
	}

	static reset(){
		for (const [seatButton, seat] of Seat.occupiedSeats){
			seat.deoccupy();
			seatButton.Remove();
		}

		Seat.occupiedSeats.clear();
		Seat.playerSeats.clear();
		Seat.counter = 0;
		Seat.newOccupantsQueue.length = 0;
	}

	static resetNames(){
		for (const occupant of i.FindEntitiesByName('*_func_vehicle_occupant*'))
			occupant.SetEntityName('')
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

		Seat.occupiedSeats.set(seatButton, this);
	}

	occupy(occupant){
		this.occupant = occupant;
		[this.floor, ...this.collisions] = i.FindEntityByName('func_vehicle_template').ForceSpawn();

		// disable collisions
		this.occupant.SetEntityName(this.name + '_func_vehicle_occupant' + ++this.counter);
		for (const collision of this.collisions)
			i.EntFireAtTarget({target: collision, input: 'DisableCollisionsWith', value: this.occupant.GetEntityName()});

		Seat.newOccupantsQueue.push(this);

		Seat.playerSeats.set(this.occupant, this);
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

			// enable collisions
			for (const collision of this.collisions){
				i.EntFireAtTarget({target: collision, input: 'EnableCollisions'});
				i.EntFireAtTarget({target: collision, input: 'Kill'});
			}
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
				this.occupant.Teleport(null, occupantAngles, null);
			}
			else {
				const seatOutAngles = this.seatOut.GetAbsAngles();
				seatOutAngles.roll = 0;
				this.occupant.Teleport(this.seatOut.GetAbsOrigin(), seatOutAngles, ZEROVECTOR);
				this.occupant.SetParent(null);
			}
		}
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

Seat.resetNames();
Seat.init();

i.OnRoundEnd(Seat.reset);

i.OnRoundStart(() => {
	Seat.resetNames();
	Seat.init();
});

i.OnPlayerKill(({player}) => {
	const seat = Seat.playerSeats.get(player);
	if (seat != undefined) seat.deoccupy();
});

i.OnPlayerDisconnect((_) => {
	for (const [_, seat] of Seat.occupiedSeats)
		if (seat.occupant == undefined || seat.occupant.GetPlayerController() == undefined)
			return seat.deoccupy();
});

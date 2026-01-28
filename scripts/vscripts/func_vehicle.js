import { Instance } from 'cs_script/point_script';

const ZEROVECTOR = {x:0, y:0, z:0};

const ZEROANGLES = {pitch:0, yaw:0, roll:0};

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

	static occupiedVecs = [];

	static DAMAGETHRESHOLD = 5;

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

		this.velVec = ZEROVECTOR;
		this.ang = Object.values(this.body.GetAbsAngles());
		this.angVelVec = [0, 0, 0];

		Vehicle.occupiedVecs.push(this);
	}

	scaleThrusters(direction, scale){
		Instance.EntFireAtName({name: this[direction], input: "Scale", value: scale});
	}

	isWheeled(){
		return this.wheelsAnchor != undefined;
	}

	drive(forward=false, backward=false, right=false, left=false){
		// find vehicle movement yaw relative to its yaw
		const vecVelYaw = findYaw(this.velVec);
		const vecRelYaw = vecVelYaw - this.ang[1];

		// calculate torque scale
		const vecVel = magnitude2d(this.velVec);
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


	updateDamage(){
		this.damage = 0;

		// linear damage
		const velVec = this.body.GetAbsVelocity();
		const acc = magnitude2d(velVec)-magnitude2d(this.velVec);
		const linDamage = Math.round(acc**2/50000);
		this.velVec = velVec;
		if (linDamage >= Vehicle.DAMAGETHRESHOLD)
			this.damage += linDamage;

		// angular damage
		const ang = Object.values(this.body.GetAbsAngles());
		let angDamage = 0;
		for (let i=0; i<3; i++){
			const angVel = Math.sign(ang[i]) == Math.sign(this.ang[i]) ? ang[i]-this.ang[i] : ang[i]+this.ang[i];
			this.ang[i] = ang[i];
			const angAcc = angVel-this.angVelVec[i];
			this.angVelVec[i] = angVel;
			const currentAngDamage = Math.round(Math.abs(angAcc)/2);
			if (currentAngDamage > angDamage)
				angDamage = currentAngDamage;
		}
		if (angDamage >= Vehicle.DAMAGETHRESHOLD)
			this.damage += angDamage;
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
	 * A count of all occupations since round start, used to give players unique names instead of seat names that can be repeated for a player not occupying any vehicle
	 */
	static counter = 0;
	static occupiedSeats = new Map(); // seat button entity => occupied Seat
	static playerSeats = new Map(); // player entity => occupied Seat

	static init(){
		for (const seatButton of Instance.FindEntitiesByName("*_seat*_button"))
			Instance.ConnectOutput(seatButton, "OnPressed", useVehicle);
	}

	static reset(){
		for (const [seatButton, seat] of Seat.occupiedSeats){
			seat.deoccupy();
			seatButton.Remove();
		}

		Vehicle.occupiedVecs.length = 0;
		Seat.occupiedSeats.clear();
		Seat.playerSeats.clear();
		Seat.counter = 0;
		Seat.newOccupantsQueue.length = 0;
	}

	static resetNames(){
		for (const occupant of Instance.FindEntitiesByName('*_func_vehicle_occupant*'))
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

		this.seatIn = Instance.FindEntityByName(this.name + '_in');
		this.seatOut = Instance.FindEntityByName(this.name + '_out');

		this.occupy(occupant);

		Seat.occupiedSeats.set(seatButton, this);
	}

	occupy(occupant){
		this.occupant = occupant;
		[this.floor, ...this.collisions] = Instance.FindEntityByName('func_vehicle_template').ForceSpawn();

		// disable collisions
		this.occupant.SetEntityName(this.name + '_func_vehicle_occupant' + ++this.counter);
		for (const collision of this.collisions)
			Instance.EntFireAtTarget({target: collision, input: 'DisableCollisionsWith', value: this.occupant.GetEntityName()});

		Seat.newOccupantsQueue.push(this);

		Seat.playerSeats.set(this.occupant, this);

		// API
		Instance.EntFireAtTarget({target: this.seatIn, input: 'FireUser1', value: this.name.replace(/.*(\d+)/, '$1'), activator: this.occupant});
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
				Instance.EntFireAtTarget({target: collision, input: 'EnableCollisions'});
				Instance.EntFireAtTarget({target: collision, input: 'Kill'});
			}
		}

		// remove seat from occupied seats
		Seat.occupiedSeats.delete(this.seatButton);
		
		// remove occupant from player seats map
		Seat.playerSeats.delete(this.occupant);

		// API
		Instance.EntFireAtTarget({target: this.seatIn, input: 'FireUser2', value: this.name.replace(/.*(\d+)/, '$1'), activator: this.occupant});
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
				Instance.EntFireAtTarget({target: this.occupant, input: "SetLocalOrigin", value: `0 ${seatInLocalY > 0 ? 64 : -64} 16`});
				Instance.EntFireAtTarget({target: this.occupant, input: "ClearParent"});

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

	damage(){
		const health = this.occupant.GetHealth();
		const newHealth = health - this.vehicle.damage;
		if (newHealth > 0)
			this.occupant.SetHealth(newHealth);
		else
			this.occupant.Kill();
	}
}

function magnitude2d(v){
	return Math.sqrt(v.x**2 + v.y**2)
}

function findYaw(v){
	const m = magnitude2d(v);

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
	// occupied by another player, force him out
	else
		seat.deoccupy();
}

Seat.resetNames();
Seat.init();

Instance.OnRoundEnd(Seat.reset);

Instance.OnRoundStart(() => {
	Seat.resetNames();
	Seat.init();
});

Instance.OnPlayerKill(({player}) => {
	const seat = Seat.playerSeats.get(player);
	if (seat != undefined) seat.deoccupy();
});

Instance.OnPlayerDisconnect((_) => {
	for (const [_, seat] of Seat.occupiedSeats)
		if (seat.occupant == undefined || seat.occupant.GetPlayerController() == undefined)
			return seat.deoccupy();
});

Instance.SetThink(() => {
	while (Seat.newOccupantsQueue.length){
		const seat = Seat.newOccupantsQueue.pop();
		if (!seat.isDriver())
			seat.occupant.SetParent(seat.seatIn);
		seat.teleportOccupant();
	}

	for (const vec of Vehicle.occupiedVecs)
		vec.updateDamage();

	for (const [_, seat] of Seat.occupiedSeats){
		const seatInAngles = seat.seatIn.GetAbsAngles();
		const undrivable = Math.abs(seatInAngles.pitch) > 45 || Math.abs(seatInAngles.roll) > 40;

		// if driver, detect his movement direction to move vehicle before teleporting him
		if (seat.isDriver()){
			// reset vehicle
			seat.vehicle.drive(false,false,false,false);

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
						seat.vehicle.drive(true ,false,false,false);
					// backward
					else if (drvRelYaw > 180 - Vehicle.DEVIATION && drvRelYaw < 180 + Vehicle.DEVIATION)
						seat.vehicle.drive(false,true ,false,false);
					// left
					else if (drvRelYaw > 90 - Vehicle.DEVIATION && drvRelYaw < 90 + Vehicle.DEVIATION)
						seat.vehicle.drive(false,false,false,true );
					// right
					else if (drvRelYaw > 270 - Vehicle.DEVIATION && drvRelYaw < 270 + Vehicle.DEVIATION)
						seat.vehicle.drive(false,false,true ,false);
					// forward left
					else if (drvRelYaw > 45 - Vehicle.DEVIATION && drvRelYaw < 45 + Vehicle.DEVIATION)
						seat.vehicle.drive(true ,false,false,true );
					// forward right
					else if (drvRelYaw > 315 - Vehicle.DEVIATION && drvRelYaw < 315 + Vehicle.DEVIATION)
						seat.vehicle.drive(true ,false,true ,false);
					// backward left
					else if (drvRelYaw > 135 - Vehicle.DEVIATION && drvRelYaw < 135 + Vehicle.DEVIATION)
						seat.vehicle.drive(false,true ,false,true );
					// backward right
					else if	(drvRelYaw > 225 - Vehicle.DEVIATION && drvRelYaw < 225 + Vehicle.DEVIATION)
						seat.vehicle.drive(false,true ,true ,false);
				}
			}
		}

		const newOrigin = seat.seatIn.GetAbsOrigin();
		newOrigin.z += 2;
		if (seat.isDriver() && !undrivable){
			seat.floor.Teleport(seat.seatIn.GetAbsOrigin(), ZEROANGLES, null);
			seat.occupant.Teleport(newOrigin, null, ZEROVECTOR);
		}
		else {
			seat.floor.Teleport(seat.seatIn.GetAbsOrigin(), seatInAngles, null);
			seat.occupant.Teleport(newOrigin, null, null);
		}

		seat.damage();
	}
	Instance.SetNextThink(Instance.GetGameTime());
});
Instance.SetNextThink(Instance.GetGameTime());

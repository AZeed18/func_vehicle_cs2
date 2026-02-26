import { Instance } from 'cs_script/point_script';

const ZEROVECTOR = {x:0, y:0, z:0};

const CSInputs = {
	FORWARD: 1 << 0,
	BACK: 1 << 1,
	LEFT: 1 << 2,
	RIGHT: 1 << 3};

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

	occupiedSeats = [];

	constructor(vecName){
		this.body = Instance.FindEntityByName(vecName + '_body');
		this.forward = vecName + '_forward';
		this.right = vecName + '_right';

		// parse steering info
		for (const steerEnt of Instance.FindEntitiesByName(vecName + '_steer')){
			this.steeringInfo.push({
				entity: steerEnt.GetParent(),
				deviation: Object.entries(steerEnt.GetLocalAngles()).filter(([_, ang]) => {return ang!=0})
			});
		}

		this.velVec = ZEROVECTOR;
		this.ang = Object.values(this.body.GetAbsAngles());
		this.angVelVec = [0, 0, 0];

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
			info.entity.Teleport(null, steeredAngles, null);
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
		this.occupant.SetEntityName(this.name + '_func_vehicle_occupant' + ++Seat.counter);
		for (const collision of this.collisions)
			Instance.EntFireAtTarget({target: collision, input: 'DisableCollisionsWith', value: this.occupant.GetEntityName()});

		this.vehicle.addSeat(this);

		Seat.newOccupantsQueue.push(this);

		Seat.playerSeats.set(this.occupant, this);

		// API
		Instance.EntFireAtTarget({target: this.seatIn, input: 'FireUser1', value: this.name.replace(/.*(\d+)/, '$1'), activator: this.occupant});
	}

	deoccupy(teleport=true){
		// reset thrusters and steering
		if (this.isDriver())
			this.vehicle.drive(false,false,false,false);

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

		this.vehicle.removeSeat(this);

		// remove seat from occupied seats
		Seat.occupiedSeats.delete(this.seatButton);

		// remove occupant from player seats map
		Seat.playerSeats.delete(this.occupant);

		// API
		if (this.seatIn.IsValid())
			Instance.EntFireAtTarget({target: this.seatIn, input: 'FireUser2', value: this.name.replace(/.*(\d+)/, '$1'), activator: this.occupant});
	}

	isDriver(){
		return this.name.endsWith('0');
	}

	teleportOccupant(inside=true){
		if (inside){
			const occupantAngles = this.occupant.GetAbsAngles();
			occupantAngles.yaw += this.seatIn.GetAbsOrigin().yaw;
			this.occupant.Teleport(this.seatIn.GetAbsOrigin(), occupantAngles, ZEROVECTOR);
		}
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
	if (seat != undefined) seat.deoccupy(false);
});

Instance.OnPlayerDisconnect((_) => {
	for (const [_, seat] of Seat.occupiedSeats)
		if (seat.occupant == undefined || seat.occupant.GetPlayerController() == undefined)
			return seat.deoccupy(false);
});

Instance.SetThink(() => {
	while (Seat.newOccupantsQueue.length){
		const seat = Seat.newOccupantsQueue.pop();
		seat.occupant.SetParent(seat.seatIn);
		seat.teleportOccupant();
	}

	for (const vec of Vehicle.occupiedVecs)
		if (vec.body.IsValid())
			vec.updateDamage();
		else
			vec.deoccupy();

	// driving
	for (const [_, seat] of Seat.occupiedSeats){

		if (seat.isDriver()){
			seat.vehicle.drive(
				seat.occupant.IsInputPressed(CSInputs.FORWARD) && !seat.occupant.IsInputPressed(CSInputs.BACK),
				seat.occupant.IsInputPressed(CSInputs.BACK) && !seat.occupant.IsInputPressed(CSInputs.FORWARD),
				seat.occupant.IsInputPressed(CSInputs.RIGHT) && !seat.occupant.IsInputPressed(CSInputs.LEFT),
				seat.occupant.IsInputPressed(CSInputs.LEFT) && !seat.occupant.IsInputPressed(CSInputs.RIGHT)
			);
		}

		seat.floor.Teleport(seat.seatIn.GetAbsOrigin(), seat.seatIn.GetAbsAngles(), null);
		seat.occupant.Teleport(seat.seatIn.GetAbsOrigin(), null, null);

		seat.damage();
	}
	Instance.SetNextThink(Instance.GetGameTime());
});
Instance.SetNextThink(Instance.GetGameTime());

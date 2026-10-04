import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { AdminService } from './admin/admin.service';
import { AuthenticationService } from './authentication/authentication.service';
import { ChatGateway } from './chat/chat.gateway';
import { ChatService } from './chat/chat.service';
import { CommunitiesController } from './communities/communities.controller';
import { CommunitiesService } from './communities/communities.service';
import { CreateCommunityDto } from './communities/dto/create-community.dto';
import { HelpRequestsController } from './help-requests/help-requests.controller';
import { HelpRequestsService } from './help-requests/help-requests.service';
import { CreateHelpRequestDto } from './help-requests/dto/create-help-request.dto';
import { MapService } from './map/map.service';
import { RatingsService } from './ratings/ratings.service';
import { VolunteerService } from './volunteer/volunteer.service';
import { FirebaseService } from './firebase/firebase.service';
import { HelpRequestMediaService } from './help-requests/help-request-media.service';

type MutableDoc = Record<string, any> & {
    _id: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
    save: () => Promise<any>;
    deleteOne: () => Promise<any>;
};

let clockTick = 0;

const idString = (value: any): string => {
    const raw = value?._id ?? value;
    return raw instanceof Types.ObjectId ? raw.toString() : String(raw);
};

const sameId = (left: any, right: any) => idString(left) === idString(right);

const readPath = (doc: any, path: string) =>
    path.split('.').reduce((current, key) => current?.[key], doc);

const valueMatches = (actual: any, expected: any): boolean => {
    if (
        expected &&
        typeof expected === 'object' &&
        !(expected instanceof Types.ObjectId) &&
        !Array.isArray(expected)
    ) {
        if ('$ne' in expected) return !sameId(actual, expected.$ne);
        if ('$in' in expected) return expected.$in.some((item: any) => sameId(actual, item));
        if ('$lte' in expected) return actual <= expected.$lte;
        if ('$near' in expected) return actual !== undefined;
        if ('$regex' in expected) {
            return new RegExp(expected.$regex, expected.$options).test(String(actual ?? ''));
        }

        return Object.entries(expected).every(([key, nested]) =>
            valueMatches(actual?.[key], nested),
        );
    }

    if (actual instanceof Types.ObjectId || expected instanceof Types.ObjectId) {
        return sameId(actual, expected);
    }

    return actual === expected;
};

const matchesQuery = (doc: any, query: any): boolean => {
    if (!query) return true;

    return Object.entries(query).every(([key, expected]) => {
        if (key === '$or') {
            return (expected as any[]).some((branch) => matchesQuery(doc, branch));
        }

        return valueMatches(readPath(doc, key), expected);
    });
};

const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const earthRadiusMeters = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a));
};

class InMemoryQuery<T = any> {
    constructor(
        private result: T | T[] | null,
        private readonly modelName: string,
    ) {}

    select() {
        return this;
    }

    sort(sortSpec: Record<string, 1 | -1>) {
        if (!Array.isArray(this.result)) return this;

        const [field, direction] = Object.entries(sortSpec)[0] ?? [];
        if (!field) return this;

        this.result = [...this.result].sort((left: any, right: any) => {
            const leftValue = readPath(left, field);
            const rightValue = readPath(right, field);
            const leftTime = leftValue instanceof Date ? leftValue.getTime() : leftValue;
            const rightTime = rightValue instanceof Date ? rightValue.getTime() : rightValue;
            return direction === -1 ? rightTime - leftTime : leftTime - rightTime;
        });

        return this;
    }

    limit(count: number) {
        if (Array.isArray(this.result)) {
            this.result = this.result.slice(0, count);
        }
        return this;
    }

    populate(path: string) {
        const populateOne = (doc: any) => populateDoc(this.modelName, doc, path);
        if (Array.isArray(this.result)) {
            this.result = this.result.map(populateOne) as T[];
        } else if (this.result) {
            this.result = populateOne(this.result);
        }
        return this;
    }

    async exec() {
        return this.result;
    }

    then<TResult1 = T | T[] | null, TResult2 = never>(
        onfulfilled?: ((value: T | T[] | null) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
        return this.exec().then(onfulfilled, onrejected);
    }
}

class InMemoryDocument {
    _id: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;

    constructor(data: Record<string, any> = {}) {
        Object.assign(this, data);
        this._id = data._id ? new Types.ObjectId(idString(data._id)) : new Types.ObjectId();
        this.createdAt =
            data.createdAt ?? new Date(Date.UTC(2026, 0, 1, 0, 0, clockTick++));
        this.updatedAt = data.updatedAt ?? this.createdAt;
    }

    async save() {
        const model = this.constructor as typeof InMemoryDocument & {
            documents: MutableDoc[];
        };
        const existingIndex = model.documents.findIndex((doc) => sameId(doc._id, this._id));
        this.updatedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, clockTick++));

        if (existingIndex >= 0) {
            model.documents[existingIndex] = this as any;
        } else {
            model.documents.push(this as any);
        }

        return this;
    }

    async deleteOne() {
        const model = this.constructor as typeof InMemoryDocument & {
            documents: MutableDoc[];
        };
        const before = model.documents.length;
        model.documents = model.documents.filter((doc) => !sameId(doc._id, this._id));
        return { deletedCount: before - model.documents.length };
    }

    toString() {
        return this._id.toString();
    }
}

class SignupModel extends InMemoryDocument {
    static documents: MutableDoc[] = [];

    static reset() {
        this.documents = [];
    }

    static find(query: any) {
        return new InMemoryQuery(this.documents.filter((doc) => matchesQuery(doc, query)), 'Signup');
    }

    static findOne(query: any) {
        return new InMemoryQuery(this.documents.find((doc) => matchesQuery(doc, query)) ?? null, 'Signup');
    }

    static findById(id: string) {
        return new InMemoryQuery(this.documents.find((doc) => sameId(doc._id, id)) ?? null, 'Signup');
    }

    static aggregate(pipeline: any[]) {
        const geoNear = pipeline.find((stage) => stage.$geoNear)?.$geoNear;
        if (!geoNear) return new InMemoryQuery([], 'Signup');

        const [lng, lat] = geoNear.near.coordinates;
        const maxDistance = geoNear.maxDistance ?? Infinity;
        const queryFilter = geoNear.query ?? {};

        const matches = this.documents.filter((doc) => {
            if (!matchesQuery(doc, queryFilter)) return false;
            const coords = doc.location?.coordinates;
            if (!coords || coords.length < 2) return false;
            const distanceMeters = haversineMeters(lat, lng, coords[1], coords[0]);
            if (distanceMeters > maxDistance) return false;
            return true;
        });

        return new InMemoryQuery(
            matches.map((doc) => ({
                _id: doc._id,
                username: doc.username,
                email: doc.email,
                role: doc.role,
                location: doc.location,
                distanceKm: 0,
            })),
            'Signup',
        );
    }
}

class VolunteerModel extends InMemoryDocument {
    static documents: MutableDoc[] = [];

    static reset() {
        this.documents = [];
    }

    static find(query: any) {
        return new InMemoryQuery(
            this.documents.filter((doc) => matchesQuery(doc, query)),
            'Volunteer',
        );
    }

    static findOne(query: any) {
        return new InMemoryQuery(
            this.documents.find((doc) => matchesQuery(doc, query)) ?? null,
            'Volunteer',
        );
    }

    static findById(id: string) {
        return new InMemoryQuery(
            this.documents.find((doc) => sameId(doc._id, id)) ?? null,
            'Volunteer',
        );
    }
}

class HelpRequestModel extends InMemoryDocument {
    static documents: MutableDoc[] = [];

    static reset() {
        this.documents = [];
    }

    static find(query: any) {
        return new InMemoryQuery(
            this.documents.filter((doc) => matchesQuery(doc, query)),
            'HelpRequest',
        );
    }

    static findById(id: string) {
        return new InMemoryQuery(
            this.documents.find((doc) => sameId(doc._id, id)) ?? null,
            'HelpRequest',
        );
    }

    static findOneAndUpdate(query: any, update: any) {
        const doc = this.documents.find((item) => matchesQuery(item, query));
        if (!doc) return new InMemoryQuery(null, 'HelpRequest');

        if (update?.$set) {
            Object.assign(doc, update.$set);
        }
        doc.updatedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, clockTick++));

        return new InMemoryQuery(doc, 'HelpRequest');
    }

    static updateMany(query: any, update: any) {
        let modifiedCount = 0;
        for (const doc of this.documents.filter((item) => matchesQuery(item, query))) {
            if (update?.$set) Object.assign(doc, update.$set);
            modifiedCount++;
        }
        return new InMemoryQuery({ modifiedCount } as any, 'HelpRequest');
    }

    static updateOne(query: any, update: any) {
        const doc = this.documents.find((item) => matchesQuery(item, query));
        if (!doc) return new InMemoryQuery({ matchedCount: 0 } as any, 'HelpRequest');
        if (update?.$set) Object.assign(doc, update.$set);
        if (update?.$addToSet) {
            for (const [key, value] of Object.entries(update.$addToSet)) {
                doc[key] ??= [];
                if (!doc[key].some((item: any) => sameId(item, value))) doc[key].push(value);
            }
        }
        return new InMemoryQuery({ matchedCount: 1 } as any, 'HelpRequest');
    }
}

class RatingModel extends InMemoryDocument {
    static documents: MutableDoc[] = [];

    static reset() {
        this.documents = [];
    }

    static findOne(query: any) {
        return new InMemoryQuery(
            this.documents.find((doc) => matchesQuery(doc, query)) ?? null,
            'Rating',
        );
    }

    static async aggregate(pipeline: any[]) {
        const matchStage = pipeline.find((stage) => stage.$match)?.$match ?? {};
        const matched = this.documents.filter((doc) => matchesQuery(doc, matchStage));
        const grouped = new Map<string, { volunteerId: any; total: number; count: number }>();

        for (const rating of matched) {
            const key = idString(rating.volunteerId);
            const current = grouped.get(key) ?? {
                volunteerId: rating.volunteerId,
                total: 0,
                count: 0,
            };
            current.total += rating.score;
            current.count += 1;
            grouped.set(key, current);
        }

        return [...grouped.values()].map((item) => ({
            _id: item.volunteerId,
            ratingAverage: item.total / item.count,
            ratingCount: item.count,
        }));
    }
}

class CommunityModel extends InMemoryDocument {
    static documents: MutableDoc[] = [];

    static reset() {
        this.documents = [];
    }

    static find(query: any) {
        return new InMemoryQuery(
            this.documents.filter((doc) => matchesQuery(doc, query)),
            'Community',
        );
    }

    static findById(id: string) {
        return new InMemoryQuery(
            this.documents.find((doc) => sameId(doc._id, id)) ?? null,
            'Community',
        );
    }

    static exists(query: any) {
        const doc = this.documents.find((item) => matchesQuery(item, query));
        return new InMemoryQuery(doc ? { _id: doc._id } : null, 'Community');
    }

    static updateMany(query: any, update: any) {
        let modifiedCount = 0;
        for (const doc of this.documents.filter((item) => matchesQuery(item, query))) {
            if (update?.$set) Object.assign(doc, update.$set);
            modifiedCount++;
        }
        return new InMemoryQuery({ modifiedCount } as any, 'Community');
    }

    static findOneAndUpdate(query: any, update: any) {
        const doc = this.documents.find((item) => matchesQuery(item, query));
        if (!doc) return new InMemoryQuery(null, 'Community');
        if (update?.$addToSet) {
            for (const [key, value] of Object.entries(update.$addToSet)) {
                doc[key] ??= [];
                if (!doc[key].some((item: any) => sameId(item, value))) doc[key].push(value);
            }
        }
        return new InMemoryQuery(doc, 'Community');
    }
}

class CommunityMessageModel extends InMemoryDocument {
    static documents: MutableDoc[] = [];

    static reset() {
        this.documents = [];
    }

    static find(query: any) {
        return new InMemoryQuery(
            this.documents.filter((doc) => matchesQuery(doc, query)),
            'CommunityMessage',
        );
    }

    static findById(id: string) {
        return new InMemoryQuery(
            this.documents.find((doc) => sameId(doc._id, id)) ?? null,
            'CommunityMessage',
        );
    }

    static async deleteMany(query: any) {
        const before = this.documents.length;
        this.documents = this.documents.filter((doc) => !matchesQuery(doc, query));
        return { deletedCount: before - this.documents.length };
    }
}

const findSignup = (value: any) =>
    SignupModel.documents.find((user) => sameId(user._id, value)) ?? value;

const populateDoc = (modelName: string, doc: any, path: string) => {
    if (!doc) return doc;

    if (['HelpRequest', 'Volunteer'].includes(modelName) && ['userId', 'acceptedBy'].includes(path)) {
        if (doc[path]) doc[path] = findSignup(doc[path]);
        return doc;
    }

    if (modelName === 'Community') {
        if (path === 'createdBy') doc.createdBy = findSignup(doc.createdBy);
        if (path === 'members') doc.members = doc.members.map((member: any) => findSignup(member));
        return doc;
    }

    if (modelName === 'CommunityMessage' && path === 'senderId') {
        doc.senderId = findSignup(doc.senderId);
        return doc;
    }

    return doc;
};

const helpDto = (title: string): CreateHelpRequestDto => ({
    title,
    category: 'medical',
    subCategory: 'medicine',
    description: `${title} description`,
    locationName: 'Lahore',
    latitude: 31.5204,
    longitude: 74.3587,
});

const communityDto = (title: string): CreateCommunityDto => ({
    title,
    details: `${title} details`,
    category: 'relief',
    timeNeeded: '2 hours',
    locationName: 'Lahore',
    latitude: 31.5204,
    longitude: 74.3587,
    peopleRequired: 3,
});

const reqFor = (user: any) => ({
    user: {
        sub: idString(user),
        role: user.role,
    },
});

describe('volunteer/requester role flow', () => {
    let authService: AuthenticationService;
    let volunteerService: VolunteerService;
    let adminService: AdminService;
    let helpController: HelpRequestsController;
    let helpService: HelpRequestsService;
    let communitiesController: CommunitiesController;
    let chatService: ChatService;
    let mapService: MapService;
    let jwtService: JwtService;
    let chatGateway: Pick<ChatGateway, 'notifyUsers' | 'isUserOnline' | 'disconnectUser'>;
    let requester: { _id: unknown; role: string };
    let volunteer: { _id: unknown; role: string };

    const requesterPassword = 'requester-pass';
    const volunteerPassword = 'volunteer-pass';
    const onlineIds = new Set<string>();

    const bootstrapTwoUsers = async () => {
        const requesterSignup = await authService.create({
            username: 'requester',
            email: 'requester@example.com',
            password: requesterPassword,
        });
        const volunteerSignup = await authService.create({
            username: 'volunteer',
            email: 'volunteer@example.com',
            password: volunteerPassword,
        });

        await authService.updateLocationById(idString(requesterSignup.user), 31.5204, 74.3587);
        await authService.updateLocationById(idString(volunteerSignup.user), 31.5204, 74.3587);

        const application = await volunteerService.createApplication(idString(volunteerSignup.user), {
            name: 'Volunteer Person',
            city: 'Lahore',
            location: 'Lahore',
            expertise: 'first-aid',
            reason: 'Can help nearby people',
            cnic: '3520200000000',
            cnicFrontImage: '/test-media/front',
            cnicBackImage: '/test-media/back',
        });
        await adminService.approveApplication(idString(application));

        const requesterLogin = await authService.validateUser('requester@example.com', requesterPassword);
        const volunteerLogin = await authService.validateUser('volunteer@example.com', volunteerPassword);

        requester = requesterLogin!.user;
        volunteer = volunteerLogin!.user;
        onlineIds.add(idString(volunteer));

        return { requesterLogin, volunteerLogin };
    };

    beforeEach(() => {
        clockTick = 0;
        onlineIds.clear();
        SignupModel.reset();
        VolunteerModel.reset();
        HelpRequestModel.reset();
        RatingModel.reset();
        CommunityModel.reset();
        CommunityMessageModel.reset();

        jwtService = new JwtService({ secret: 'test_secret', signOptions: { expiresIn: '1h' } });
        authService = new AuthenticationService(SignupModel as any, jwtService, {
            verifyGoogleToken: jest.fn(),
        } as unknown as FirebaseService);
        volunteerService = new VolunteerService(VolunteerModel as any, authService);
        chatGateway = {
            notifyUsers: jest.fn((userIds: string[]) => userIds.length),
            isUserOnline: jest.fn((userId: string) => onlineIds.has(userId)),
            disconnectUser: jest.fn(),
        };
        adminService = new AdminService(
            VolunteerModel as any,
            SignupModel as any,
            HelpRequestModel as any,
            authService,
            { revokeAccount: jest.fn() } as any,
            chatGateway as ChatGateway,
            {} as RatingsService,
            { notifyUsers: jest.fn().mockResolvedValue(0) } as any,
        );

        const ratingsService = new RatingsService(RatingModel as any);
        helpService = new HelpRequestsService(
            HelpRequestModel as any,
            SignupModel as any,
            VolunteerModel as any,
            chatGateway as ChatGateway,
            ratingsService,
            { deleteRequestConversation: jest.fn() } as any,
            { notifyUsers: jest.fn().mockResolvedValue(0) } as any,
            { getRoute: jest.fn(), getDistanceMatrix: jest.fn().mockResolvedValue([]) } as any,
        );
        helpController = new HelpRequestsController(helpService, {
            upload: jest.fn(),
            openDownloadStream: jest.fn(),
        } as unknown as HelpRequestMediaService, ratingsService);

        const communitiesService = new CommunitiesService(
            CommunityModel as any,
            CommunityMessageModel as any,
            { notifyUsers: jest.fn().mockResolvedValue(0) } as any,
        );
        communitiesController = new CommunitiesController(communitiesService);
        chatService = new ChatService({} as any, SignupModel as any, HelpRequestModel as any);
        mapService = new MapService(
            SignupModel as any,
            chatGateway as ChatGateway,
            { getDistanceMatrix: jest.fn().mockResolvedValue([]) } as any,
        );
    });

    it('keeps account roles stable through signup, admin approval, re-login, and volunteer-created requests', async () => {
        const { requesterLogin, volunteerLogin } = await bootstrapTwoUsers();

        expect(requesterLogin!.user.role).toBe('user');
        expect(jwtService.verify(requesterLogin!.access_token).role).toBe('user');
        expect(volunteerLogin!.user.role).toBe('volunteer');
        expect(jwtService.verify(volunteerLogin!.access_token).role).toBe('volunteer');

        const response = await helpController.create(reqFor(volunteer), helpDto('Volunteer needs help'));

        expect(response.data.request.status).toBe('open');
        expect(response.data.nearbyVolunteerCount).toBe(0);
        expect(response.data.nearbyOnlineVolunteerCount).toBe(0);
        expect(chatGateway.notifyUsers).toHaveBeenLastCalledWith(
            [],
            'new_help_request',
            expect.objectContaining({ title: 'Volunteer needs help' }),
        );

        const relogin = await authService.validateUser('volunteer@example.com', volunteerPassword);
        expect(relogin!.user.role).toBe('volunteer');
        expect(jwtService.verify(relogin!.access_token).role).toBe('volunteer');

        const community = await communitiesController.create(
            reqFor(relogin!.user),
            communityDto('Volunteer-only action after requesting help'),
        );
        expect(community.success).toBe(true);

        await expect(
            communitiesController.create(reqFor(requester), communityDto('Requester community')),
        ).rejects.toThrow(BadRequestException);
    });

    it('enforces help request accept, self-accept, resolve, and rating permissions', async () => {
        await bootstrapTwoUsers();

        const volunteerOwnRequest = await helpController.create(
            reqFor(volunteer),
            helpDto('Volunteer own request'),
        );
        await expect(
            helpController.accept(reqFor(volunteer), idString(volunteerOwnRequest.data.request)),
        ).rejects.toThrow('You cannot accept your own request');
        await expect(
            helpController.accept(reqFor(requester), idString(volunteerOwnRequest.data.request)),
        ).rejects.toThrow('Only verified volunteers can accept help requests');

        const requesterRequest = await helpController.create(
            reqFor(requester),
            helpDto('Requester needs help'),
        );

        await expect(
            helpController.accept(reqFor(requester), idString(requesterRequest.data.request)),
        ).rejects.toThrow('Only verified volunteers can accept help requests');

        const accepted = await helpController.accept(
            reqFor(volunteer),
            idString(requesterRequest.data.request),
        );
        expect(accepted.data.status).toBe('accepted');
        expect(sameId(accepted.data.acceptedBy, volunteer)).toBe(true);

        await expect(
            helpController.accept(reqFor(volunteer), idString(requesterRequest.data.request)),
        ).rejects.toThrow('This request is no longer open');

        const resolved = await helpController.resolve(
            reqFor(requester),
            idString(requesterRequest.data.request),
        );
        expect(resolved.data.status).toBe('resolved');

        const volunteerHistory = await helpController.myAcceptedHistory(reqFor(volunteer));
        expect(volunteerHistory.data).toHaveLength(1);
        expect(idString(volunteerHistory.data[0])).toBe(idString(requesterRequest.data.request));

        await helpController.hideFromHistory(
            reqFor(volunteer),
            idString(requesterRequest.data.request),
        );
        expect((await helpController.myAcceptedHistory(reqFor(volunteer))).data).toEqual([]);
        expect((await helpController.myRequests(reqFor(requester))).data).toHaveLength(1);

        await expect(
            helpController.rate(reqFor(volunteer), idString(requesterRequest.data.request), {
                score: 4,
                comment: 'wrong actor',
            }),
        ).rejects.toThrow('Only the requester can rate this help request');

        const rating = await helpController.rate(
            reqFor(requester),
            idString(requesterRequest.data.request),
            {
                score: 5,
                comment: 'fast help',
            },
        );
        expect(rating.data.rating.score).toBe(5);
        expect(rating.data.volunteerStats).toEqual({ ratingAverage: 5, ratingCount: 1 });

        await expect(
            helpController.rate(reqFor(requester), idString(requesterRequest.data.request), {
                score: 3,
            }),
        ).rejects.toThrow('This help request has already been rated');

        const relogin = await authService.validateUser('volunteer@example.com', volunteerPassword);
        expect(relogin!.user.role).toBe('volunteer');
    });

    it('returns the correct own-request views and nearby volunteer notifications for both users', async () => {
        await bootstrapTwoUsers();

        const requesterRequest = await helpController.create(
            reqFor(requester),
            helpDto('Requester active request'),
        );
        const volunteerRequest = await helpController.create(
            reqFor(volunteer),
            helpDto('Volunteer active request'),
        );

        expect(requesterRequest.data.nearbyVolunteerCount).toBe(1);
        expect(requesterRequest.data.nearbyOnlineVolunteerCount).toBe(1);
        expect(volunteerRequest.data.nearbyVolunteerCount).toBe(0);

        const requesterMine = await helpController.myRequests(reqFor(requester));
        const volunteerMine = await helpController.myRequests(reqFor(volunteer));
        const requesterActive = await helpController.myActiveRequests(reqFor(requester));
        const volunteerActive = await helpController.myActiveRequests(reqFor(volunteer));

        expect(requesterMine.data.map(idString)).toEqual([idString(requesterRequest.data.request)]);
        expect(volunteerMine.data.map(idString)).toEqual([idString(volunteerRequest.data.request)]);
        expect(requesterActive.data.map(idString)).toEqual([idString(requesterRequest.data.request)]);
        expect(volunteerActive.data.map(idString)).toEqual([idString(volunteerRequest.data.request)]);

        const nearbyVolunteers = await helpController.nearbyVolunteers(
            '31.5204',
            '74.3587',
            '10',
            'true',
        );
        expect(nearbyVolunteers.data.map(idString)).toEqual([idString(volunteer)]);
    });

    it('gates community features to volunteers/admins while allowing public community reads', async () => {
        await bootstrapTwoUsers();

        await expect(
            communitiesController.create(reqFor(requester), communityDto('Requester cannot create')),
        ).rejects.toThrow('Only volunteers can use community actions');

        const created = await communitiesController.create(
            reqFor(volunteer),
            communityDto('Volunteer community'),
        );
        const communityId = idString(created.data);

        const publicList = await communitiesController.findAll();
        const publicSingle = await communitiesController.findOne(communityId);
        expect(publicList.data.map(idString)).toContain(communityId);
        expect(idString(publicSingle.data)).toBe(communityId);

        await expect(communitiesController.join(reqFor(requester), communityId)).rejects.toThrow(
            'Only volunteers can use community actions',
        );
        await expect(
            communitiesController.sendMessage(reqFor(requester), communityId, { content: 'hello' }),
        ).rejects.toThrow('Join this community before using its chat');
        await expect(communitiesController.getMessages(reqFor(requester), communityId)).rejects.toThrow(
            'Join this community before using its chat',
        );
        await expect(communitiesController.start(reqFor(requester), communityId)).rejects.toThrow(
            'Only the community creator or admin can perform this action',
        );
        await expect(communitiesController.remove(reqFor(requester), communityId)).rejects.toThrow(
            'Only the community creator or admin can perform this action',
        );

        const message = await communitiesController.sendMessage(reqFor(volunteer), communityId, {
            content: 'Coordination note',
        });
        const messages = await communitiesController.getMessages(reqFor(volunteer), communityId);
        expect(message.data!.content).toBe('Coordination note');
        expect(messages.data).toHaveLength(1);

        const started = await communitiesController.start(reqFor(volunteer), communityId);
        expect(started.data.status).toBe('started');

        const removed = await communitiesController.remove(reqFor(volunteer), communityId);
        expect(removed.data).toEqual({ deleted: false, status: 'cancelled' });
        const cancelled = await communitiesController.findOne(communityId);
        expect(cancelled.data.status).toBe('cancelled');
    });

    it('keeps coordination contacts limited to volunteer-to-volunteer discovery', async () => {
        await bootstrapTwoUsers();

        const requesterRequest = await helpController.create(
            reqFor(requester),
            helpDto('Requester chat request'),
        );
        await helpController.accept(reqFor(volunteer), idString(requesterRequest.data.request));

        const volunteerContacts = await chatService.getCoordinationContacts(
            idString(volunteer),
            'volunteer',
        );
        const requesterContacts = await chatService.getCoordinationContacts(idString(requester), 'user');

        expect(volunteerContacts.requestees).toEqual([]);
        expect(volunteerContacts.volunteers).toEqual([]);
        expect(requesterContacts.requestees).toEqual([]);
        expect(requesterContacts.volunteers).toEqual([]);
    });

    it('keeps map markers tied to account role rather than active help-request ownership', async () => {
        await bootstrapTwoUsers();
        await helpController.create(reqFor(volunteer), helpDto('Volunteer map request'));

        const allMarkers = await mapService.getUsers({});
        const requesteeMarkers = await mapService.getUsers({ role: 'requestee' });
        const volunteerMarker = allMarkers.find((marker) => sameId(marker._id, volunteer));

        expect(volunteerMarker).toEqual(
            expect.objectContaining({
                role: 'volunteer',
                iconType: 'volunteer',
                isOnline: true,
            }),
        );
        expect(requesteeMarkers.map(idString)).toEqual([idString(requester)]);
    });
});
